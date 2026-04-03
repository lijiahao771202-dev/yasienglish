"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    ArrowRight,
    CheckCircle2,
    Eraser,
    GitBranch,
    Headphones,
    Lightbulb,
    Languages,
    PenLine,
    SendHorizontal,
    Sparkles,
    X,
} from "lucide-react";

import { getPressableStyle } from "@/lib/pressable";
import { buildReadPretestBundle } from "@/lib/read-pretest";
import { alignTokensToMarks, extractWordTokens, normalizeWordForMatch, type TtsWordMark } from "@/lib/read-speaking";
import {
    alignPronunciationTokens,
    estimateListeningProgress,
    resolveListeningScoreTier,
    scoreListeningRecognition,
    type ListeningScoreTier,
    type PronunciationTokenState,
} from "@/lib/listening-shadowing";
import { requestTtsPayload, resolveTtsAudioBlob } from "@/lib/tts-client";
import { ListeningShadowingControls } from "@/components/reading/ListeningShadowingControls";
import { WordPopup, type PopupState } from "@/components/reading/WordPopup";
import { cn } from "@/lib/utils";

type PretestStage = "confirm" | "hub" | "runner" | "complete";
type PretestModule = "listening" | "writing" | "translation";

interface BrowserSpeechRecognitionResultEntry {
    transcript?: string;
}

interface BrowserSpeechRecognitionResultLike {
    isFinal?: boolean;
    0?: BrowserSpeechRecognitionResultEntry;
}

interface BrowserSpeechRecognitionEventLike {
    results?: ArrayLike<BrowserSpeechRecognitionResultLike>;
    resultIndex?: number;
}

interface BrowserSpeechRecognitionErrorEventLike {
    error?: string;
    message?: string;
}

interface BrowserSpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: BrowserSpeechRecognitionEventLike) => void) | null;
    onerror: ((event: BrowserSpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
    interface Window {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }
}

interface PretestQuestion {
    id: string;
    module: PretestModule;
    sentence: string;
    moduleIndex: number;
    moduleTotal: number;
    globalIndex: number;
    globalTotal: number;
}

interface PretestRecord {
    questionId: string;
    module: PretestModule;
    skipped: boolean;
    answer: string;
    score?: number;
    feedback?: string;
}

interface RewritePracticePrompt {
    source_sentence_en: string;
    imitation_prompt_cn: string;
    rewrite_tips_cn: string[];
    pattern_focus_cn: string;
}

interface RewritePracticeScore {
    total_score: number;
    dimension_scores: {
        grammar: number;
        vocabulary: number;
        semantics: number;
        imitation: number;
    };
    feedback_cn: string;
    better_version_en: string;
    copy_similarity: number;
    copy_penalty_applied: boolean;
    improvement_points_cn: string[];
    corrections?: Array<{
        segment: string;
        correction: string;
        reason: string;
        category?: string;
    }>;
}

interface TranslationCorrection {
    segment: string;
    correction: string;
    reason: string;
}

interface TranslationScoreDetail {
    questionId: string;
    source_sentence_en: string;
    reference_translation_cn: string;
    user_translation_cn: string;
    score_10: number;
    judge_reasoning_cn: string;
    better_translation_cn: string;
    improvement_points_cn: string[];
    corrections: TranslationCorrection[];
    isLoading: boolean;
}

interface SubmitScoreFx {
    module: "writing" | "translation";
    score: number;
    tier: ListeningScoreTier;
    title: string;
    detail: string;
}

interface QuestionFeedback {
    module: PretestModule;
    scoreLabel: string;
    feedback: string;
    rewriteScore?: RewritePracticeScore;
    translationDetail?: TranslationScoreDetail;
}

interface ReadPretestOverlayProps {
    visible: boolean;
    articleTitle: string;
    articleText: string;
    articleKey: string;
    currentElo?: number;
    onClose: () => void;
    onDirectQuiz: () => void;
    onEnterQuiz: () => void;
    onMarkCompleted: () => Promise<void> | void;
}

const MODULE_ORDER: PretestModule[] = ["listening", "writing", "translation"];
const MODULE_META: Record<PretestModule, {
    title: string;
    subtitle: string;
    icon: ComponentType<{ className?: string }>;
    chipClass: string;
}> = {
    listening: {
        title: "听力测试",
        subtitle: "抽 5 句 · 自动评分",
        icon: Headphones,
        chipClass: "border-[#c8e4ff] bg-[#eef7ff] text-[#2f66f3]",
    },
    writing: {
        title: "仿写测试",
        subtitle: "抽 3 句 · AI 反馈",
        icon: PenLine,
        chipClass: "border-[#bfead4] bg-[#f0fff7] text-[#1f9a67]",
    },
    translation: {
        title: "翻译测试",
        subtitle: "抽 3 句 · AI 评分",
        icon: Languages,
        chipClass: "border-[#decfff] bg-[#f7f2ff] text-[#7a58e8]",
    },
};

function normalizeWhitespace(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function normalizeCompareText(text: string) {
    return normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[\s.,，。！？!?:：；;、"'“”‘’（）()\-—]/g, "");
}

function clampScore100(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeStringArray(value: unknown, maxCount: number) {
    if (!Array.isArray(value)) return [] as string[];
    return value
        .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
        .filter(Boolean)
        .slice(0, maxCount);
}

function normalizeRewritePromptPayload(raw: unknown, fallbackSentence: string) {
    const payload = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;
    if (!payload) return null;

    const sourceSentence = typeof payload.source_sentence_en === "string"
        ? normalizeWhitespace(payload.source_sentence_en)
        : normalizeWhitespace(fallbackSentence);
    const imitationPrompt = typeof payload.imitation_prompt_cn === "string"
        ? normalizeWhitespace(payload.imitation_prompt_cn)
        : "";
    const patternFocus = typeof payload.pattern_focus_cn === "string"
        ? normalizeWhitespace(payload.pattern_focus_cn)
        : "";
    const rewriteTips = normalizeStringArray(payload.rewrite_tips_cn, 3);

    if (!sourceSentence) return null;

    return {
        source_sentence_en: sourceSentence,
        imitation_prompt_cn: imitationPrompt || "保持原意，替换语境并重写表达。",
        pattern_focus_cn: patternFocus || "保留句子骨架，替换关键词与主语。",
        rewrite_tips_cn: rewriteTips,
    } as RewritePracticePrompt;
}

function normalizeRewriteScorePayload(raw: unknown) {
    const payload = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;
    const dimensions = typeof payload?.dimension_scores === "object" && payload.dimension_scores !== null
        ? payload.dimension_scores as Record<string, unknown>
        : {};
    const correctionsRaw = Array.isArray(payload?.corrections) ? payload.corrections : [];

    const corrections = correctionsRaw
        .map((item) => {
            const row = typeof item === "object" && item !== null ? item as Record<string, unknown> : null;
            if (!row) return null;
            const segment = typeof row.segment === "string" ? normalizeWhitespace(row.segment) : "";
            const correction = typeof row.correction === "string" ? normalizeWhitespace(row.correction) : "";
            const reason = typeof row.reason === "string" ? normalizeWhitespace(row.reason) : "";
            if (!segment || !correction || !reason) return null;
            return {
                segment,
                correction,
                reason,
                category: typeof row.category === "string" ? row.category : undefined,
            };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, 4);

    const similarity = Number(payload?.copy_similarity);
    const safeSimilarity = Number.isFinite(similarity) ? Math.max(0, Math.min(1, similarity)) : 0;

    return {
        total_score: clampScore100(payload?.total_score),
        dimension_scores: {
            grammar: clampScore100(dimensions.grammar),
            vocabulary: clampScore100(dimensions.vocabulary),
            semantics: clampScore100(dimensions.semantics),
            imitation: clampScore100(dimensions.imitation),
        },
        feedback_cn: typeof payload?.feedback_cn === "string" && payload.feedback_cn.trim()
            ? payload.feedback_cn.trim()
            : "已完成仿写评分。",
        better_version_en: typeof payload?.better_version_en === "string"
            ? normalizeWhitespace(payload.better_version_en)
            : "",
        copy_similarity: safeSimilarity,
        copy_penalty_applied: Boolean(payload?.copy_penalty_applied),
        improvement_points_cn: normalizeStringArray(payload?.improvement_points_cn, 4),
        corrections,
    } as RewritePracticeScore;
}

function clampScore10(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(10, numeric));
}

function normalizeTranslationCritiquePayload(raw: unknown) {
    const payload = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;
    const correctionsRaw = Array.isArray(payload?.corrections) ? payload.corrections : [];

    const corrections = correctionsRaw
        .map((item) => {
            const row = typeof item === "object" && item !== null ? item as Record<string, unknown> : null;
            if (!row) return null;
            const segment = typeof row.segment === "string" ? normalizeWhitespace(row.segment) : "";
            const correction = typeof row.correction === "string" ? normalizeWhitespace(row.correction) : "";
            const reason = typeof row.reason === "string" ? normalizeWhitespace(row.reason) : "";
            if (!segment || !correction || !reason) return null;
            return { segment, correction, reason } as TranslationCorrection;
        })
        .filter((item): item is TranslationCorrection => Boolean(item))
        .slice(0, 4);

    const feedback = typeof payload?.feedback === "string" ? normalizeWhitespace(payload.feedback) : "";
    const betterTranslation = typeof payload?.better_translation === "string"
        ? normalizeWhitespace(payload.better_translation)
        : "";
    const improvements = normalizeStringArray(payload?.improvement_points_cn, 4);
    const fallbackImprovements = feedback ? [feedback] : [];

    return {
        better_translation_cn: betterTranslation,
        corrections,
        improvement_points_cn: improvements.length > 0 ? improvements : fallbackImprovements,
    };
}

function toQuestions(bundle: ReturnType<typeof buildReadPretestBundle>) {
    const byModule: Record<PretestModule, string[]> = {
        listening: bundle.listening,
        writing: bundle.writing,
        translation: bundle.translation,
    };
    const total = MODULE_ORDER.reduce((sum, moduleType) => sum + byModule[moduleType].length, 0);
    const questions: PretestQuestion[] = [];
    let globalIndex = 0;

    for (const moduleType of MODULE_ORDER) {
        const items = byModule[moduleType];
        for (let index = 0; index < items.length; index += 1) {
            questions.push({
                id: `${moduleType}-${index}`,
                module: moduleType,
                sentence: items[index],
                moduleIndex: index + 1,
                moduleTotal: items.length,
                globalIndex: globalIndex + 1,
                globalTotal: total,
            });
            globalIndex += 1;
        }
    }
    return questions;
}

export function ReadPretestOverlay({
    visible,
    articleTitle,
    articleText,
    articleKey,
    currentElo,
    onClose,
    onDirectQuiz,
    onEnterQuiz,
    onMarkCompleted,
}: ReadPretestOverlayProps) {
    const prefersReducedMotion = useReducedMotion();
    const [stage, setStage] = useState<PretestStage>("confirm");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answerDraft, setAnswerDraft] = useState("");
    const [records, setRecords] = useState<Record<string, PretestRecord>>({});
    const [questionFeedback, setQuestionFeedback] = useState<QuestionFeedback | null>(null);
    const [runnerError, setRunnerError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [translationRefMap, setTranslationRefMap] = useState<Record<string, string>>({});
    const [translationRefLoading, setTranslationRefLoading] = useState(false);
    const [translationRefError, setTranslationRefError] = useState<string | null>(null);
    const [writingPromptMap, setWritingPromptMap] = useState<Record<string, RewritePracticePrompt>>({});
    const [writingPromptErrorMap, setWritingPromptErrorMap] = useState<Record<string, string>>({});
    const [writingPromptLoadingId, setWritingPromptLoadingId] = useState<string | null>(null);
    const [showWritingScoreDetails, setShowWritingScoreDetails] = useState(false);
    const [showTranslationScoreDetails, setShowTranslationScoreDetails] = useState(false);
    const [submitScoreFx, setSubmitScoreFx] = useState<SubmitScoreFx | null>(null);
    const submitScoreFxTimerRef = useRef<number | null>(null);
    const writingPromptPendingRef = useRef(new Set<string>());
    const [countdown, setCountdown] = useState(3);
    const completeMarkedRef = useRef(false);
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const ttsAudioUrlRef = useRef<string | null>(null);
    const ttsRequestIdRef = useRef(0);
    const [isPreparingAudio, setIsPreparingAudio] = useState(false);
    const selfRecordAudioRef = useRef<HTMLAudioElement | null>(null);
    const selfRecordAudioUrlRef = useRef<string | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recorderStreamRef = useRef<MediaStream | null>(null);
    const recorderChunksRef = useRef<Blob[]>([]);
    const discardRecordingOnStopRef = useRef(false);
    const [isRecordingSelfVoice, setIsRecordingSelfVoice] = useState(false);
    const [hasSelfRecording, setHasSelfRecording] = useState(false);
    const [isReferenceAudioPlaying, setIsReferenceAudioPlaying] = useState(false);
    const [referenceWordMarks, setReferenceWordMarks] = useState<TtsWordMark[]>([]);
    const [activeReferenceWordMarkIndex, setActiveReferenceWordMarkIndex] = useState<number | null>(null);
    const [liveRecognitionTranscript, setLiveRecognitionTranscript] = useState("");
    const [isSpeechRecognitionRunning, setIsSpeechRecognitionRunning] = useState(false);
    const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(true);
    const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
    const speechRecognitionStopRequestedRef = useRef(false);
    const speechRecognitionFinalTranscriptRef = useRef("");
    const speechRecognitionInterimTranscriptRef = useRef("");
    const listeningProgressCursorRef = useRef(0);
    const [showListeningCorrection, setShowListeningCorrection] = useState(false);
    const [listeningProgressCursor, setListeningProgressCursor] = useState(0);
    const [isListeningAdvancePending, setIsListeningAdvancePending] = useState(false);
    const listeningAdvanceTimerRef = useRef<number | null>(null);
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);
    const lastWordPopupTriggerRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
    const [listeningScoreFx, setListeningScoreFx] = useState<{
        score: number;
        tier: ListeningScoreTier;
        title: string;
        detail: string;
    } | null>(null);

    const clearListeningAdvanceTimer = useCallback(() => {
        if (listeningAdvanceTimerRef.current !== null) {
            window.clearTimeout(listeningAdvanceTimerRef.current);
            listeningAdvanceTimerRef.current = null;
        }
    }, []);

    const clearSubmitScoreFxTimer = useCallback(() => {
        if (submitScoreFxTimerRef.current !== null) {
            window.clearTimeout(submitScoreFxTimerRef.current);
            submitScoreFxTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setIsSpeechRecognitionSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    }, []);

    const bundle = useMemo(
        () => buildReadPretestBundle({ articleText, articleKey }),
        [articleKey, articleText],
    );
    const questions = useMemo(() => toQuestions(bundle), [bundle]);
    const totalQuestions = questions.length;
    const currentQuestion = questions[currentIndex] ?? null;
    const currentWritingPrompt = currentQuestion?.module === "writing"
        ? writingPromptMap[currentQuestion.id]
        : undefined;
    const currentWritingPromptError = currentQuestion?.module === "writing"
        ? writingPromptErrorMap[currentQuestion.id]
        : undefined;
    const isWritingScored = currentQuestion?.module === "writing"
        && questionFeedback?.module === "writing"
        && Boolean(questionFeedback.rewriteScore);
    const isTranslationScored = currentQuestion?.module === "translation"
        && questionFeedback?.module === "translation"
        && Boolean(questionFeedback.translationDetail);
    const shouldHideWritingSentencePanel = currentQuestion?.module === "writing"
        && isWritingScored
        && showWritingScoreDetails;
    const shouldHideSentencePanel = shouldHideWritingSentencePanel;
    const writingCorrections = questionFeedback?.module === "writing" && questionFeedback.rewriteScore
        ? (questionFeedback.rewriteScore.corrections ?? [])
        : [];
    const hasWritingCorrections = writingCorrections.length > 0;
    const shouldShowWritingImprovementPoints = questionFeedback?.module === "writing"
        && questionFeedback.rewriteScore
        && questionFeedback.rewriteScore.improvement_points_cn.length > 0
        && !hasWritingCorrections;
    const translationDetail = questionFeedback?.module === "translation"
        ? questionFeedback.translationDetail
        : undefined;
    const translationCorrections = translationDetail?.corrections ?? [];
    const hasTranslationCorrections = translationCorrections.length > 0;
    const shouldShowTranslationImprovementPoints = (translationDetail?.improvement_points_cn.length ?? 0) > 0
        && !hasTranslationCorrections;
    const hasDistinctTranslationRecommendation = Boolean(
        translationDetail?.better_translation_cn
        && normalizeCompareText(translationDetail.better_translation_cn) !== normalizeCompareText(translationDetail.reference_translation_cn),
    );

    const moduleStats = useMemo(() => {
        const result: Record<PretestModule, { done: number; total: number; skipped: number }> = {
            listening: { done: 0, total: bundle.listening.length, skipped: 0 },
            writing: { done: 0, total: bundle.writing.length, skipped: 0 },
            translation: { done: 0, total: bundle.translation.length, skipped: 0 },
        };
        for (const record of Object.values(records)) {
            result[record.module].done += 1;
            if (record.skipped) result[record.module].skipped += 1;
        }
        return result;
    }, [bundle, records]);

    const completedCount = Object.keys(records).length;
    const skippedCount = Object.values(records).filter((row) => row.skipped).length;
    const sourceTokens = useMemo(
        () => extractWordTokens(currentQuestion?.sentence || ""),
        [currentQuestion?.sentence],
    );
    const sourceTokenToMarkIndex = useMemo(
        () => alignTokensToMarks(sourceTokens, referenceWordMarks),
        [sourceTokens, referenceWordMarks],
    );
    const liveRecognitionTokens = useMemo(
        () => extractWordTokens(liveRecognitionTranscript)
            .map((token) => normalizeWordForMatch(token.text))
            .filter(Boolean),
        [liveRecognitionTranscript],
    );
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
    const openPretestWordPopupAtPosition = useCallback((text: string, x: number, y: number, contextText?: string) => {
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

        setWordPopup({
            word: normalizedText,
            context: contextText || currentQuestion?.sentence || "",
            x,
            y,
            articleUrl: articleKey ? `pretest://${encodeURIComponent(articleKey)}` : undefined,
            sourceKind: "listening",
            sourceLabel: "来自 Read Pre-Test",
            sourceSentence: currentQuestion?.sentence || contextText || "",
            sourceNote: articleTitle || "",
        });
        return true;
    }, [articleKey, articleTitle, currentQuestion?.sentence, normalizeWordPopupText]);
    const openListeningWordPopupFromSelection = useCallback((selection: Selection | null) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return openPretestWordPopupAtPosition(
            extractSelectionPopupText(selection),
            rect.left + rect.width / 2,
            rect.bottom + 10,
            selection.anchorNode?.textContent || currentQuestion?.sentence || "",
        );
    }, [currentQuestion?.sentence, extractSelectionPopupText, openPretestWordPopupAtPosition]);
    const handleListeningWordClick = useCallback((event: ReactMouseEvent<HTMLSpanElement>) => {
        event.stopPropagation();
        if (typeof window !== "undefined" && openListeningWordPopupFromSelection(window.getSelection())) {
            return;
        }
        const tokenText = event.currentTarget.dataset.wordPopupSegment || event.currentTarget.textContent || "";
        const rect = event.currentTarget.getBoundingClientRect();
        openPretestWordPopupAtPosition(
            tokenText,
            rect.left + rect.width / 2,
            rect.bottom + 10,
            currentQuestion?.sentence || "",
        );
    }, [currentQuestion?.sentence, openListeningWordPopupFromSelection, openPretestWordPopupAtPosition]);
    const handleListeningSentenceMouseUp = useCallback(() => {
        if (currentQuestion?.module !== "listening") return;
        if (typeof window === "undefined") return;
        openListeningWordPopupFromSelection(window.getSelection());
    }, [currentQuestion?.module, openListeningWordPopupFromSelection]);
    const pronunciationFeedback = useMemo(() => {
        const targetTokens = sourceTokens
            .map((token) => ({ sourceIndex: token.index, token: normalizeWordForMatch(token.text) }))
            .filter((item) => Boolean(item.token));

        if (!showListeningCorrection && !isListeningAdvancePending) {
            return {
                tokenStates: new Map<number, PronunciationTokenState>(),
                correctCount: 0,
                totalCount: targetTokens.length,
            };
        }

        const { tokenStates, correctCount } = alignPronunciationTokens({
            targetTokens,
            spokenTokens: liveRecognitionTokens,
        });
        return {
            tokenStates,
            correctCount,
            totalCount: targetTokens.length,
        };
    }, [isListeningAdvancePending, liveRecognitionTokens, showListeningCorrection, sourceTokens]);
    const listeningProgressCount = listeningProgressCursor;
    const shouldShowListeningProgress = currentQuestion?.module === "listening" && isRecordingSelfVoice;
    const shouldShowPostRecordingCorrection = currentQuestion?.module === "listening"
        && showListeningCorrection
        && liveRecognitionTokens.length > 0;
    const sourceSentenceKaraokeContent = useMemo<ReactNode>(() => {
        const sentence = currentQuestion?.sentence || "";
        if (!sentence || sourceTokens.length === 0) return sentence;

        let cursor = 0;
        const parts: ReactNode[] = [];

        for (const token of sourceTokens) {
            if (token.start > cursor) {
                parts.push(
                    <span key={`plain-${cursor}-${token.start}`}>
                        {sentence.slice(cursor, token.start)}
                    </span>,
                );
            }

            const markIndex = sourceTokenToMarkIndex.get(token.index);
            const isActiveWord = isReferenceAudioPlaying
                && typeof markIndex === "number"
                && activeReferenceWordMarkIndex === markIndex;
            const isPassedWord = isReferenceAudioPlaying
                && typeof markIndex === "number"
                && activeReferenceWordMarkIndex !== null
                && markIndex < activeReferenceWordMarkIndex;
            const tokenState = pronunciationFeedback.tokenStates.get(token.index);

            parts.push(
                <span
                    key={`token-${token.index}-${token.start}`}
                    data-word-popup-segment={token.text}
                    onClick={handleListeningWordClick}
                    className={cn(
                        "cursor-pointer rounded-[0.38em] px-[0.08em] py-[0.01em] transition-colors duration-220 ease-out hover:bg-[#f3f4f6]/60",
                        isActiveWord
                            ? "bg-[#ffd970] text-[#7a3f00] shadow-[0_0_0_1px_rgba(234,163,27,0.42)]"
                            : isPassedWord
                                ? "text-[#6b6358]"
                                : "",
                        !isReferenceAudioPlaying && shouldShowListeningProgress && token.index < listeningProgressCount
                            ? "bg-[#eef4ff] text-[#3f5f9a]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowListeningProgress && token.index === listeningProgressCount
                            ? "bg-[#ddeaff] text-[#2f58b0] shadow-[inset_0_-1px_0_rgba(78,122,219,0.22)]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && tokenState === "correct"
                            ? "text-[#2f6f4d]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && (tokenState === "incorrect" || tokenState === "missed")
                            ? "text-[#8e4a4a] underline decoration-[#d97a7a] decoration-2 underline-offset-[0.22em]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && tokenState === "current"
                            ? "bg-[#eef4ff] text-[#2f58b0] shadow-[inset_0_-1px_0_rgba(78,122,219,0.22)]"
                            : "",
                    )}
                >
                    {sentence.slice(token.start, token.end)}
                </span>,
            );

            cursor = token.end;
        }

        if (cursor < sentence.length) {
            parts.push(
                <span key={`plain-tail-${cursor}`}>
                    {sentence.slice(cursor)}
                </span>,
            );
        }

        return parts;
    }, [
        activeReferenceWordMarkIndex,
        currentQuestion?.sentence,
        handleListeningWordClick,
        isReferenceAudioPlaying,
        listeningProgressCount,
        pronunciationFeedback.tokenStates,
        shouldShowListeningProgress,
        shouldShowPostRecordingCorrection,
        sourceTokenToMarkIndex,
        sourceTokens,
    ]);

    useEffect(() => {
        if (!visible) return;
        clearSubmitScoreFxTimer();
        setStage("confirm");
        setCurrentIndex(0);
        setAnswerDraft("");
        setRecords({});
        setQuestionFeedback(null);
        setRunnerError(null);
        setTranslationRefMap({});
        setTranslationRefError(null);
        setTranslationRefLoading(false);
        setWritingPromptMap({});
        setWritingPromptErrorMap({});
        setWritingPromptLoadingId(null);
        setShowWritingScoreDetails(false);
        setShowTranslationScoreDetails(false);
        setSubmitScoreFx(null);
        writingPromptPendingRef.current.clear();
        setCountdown(3);
        setReferenceWordMarks([]);
        setActiveReferenceWordMarkIndex(null);
        setIsReferenceAudioPlaying(false);
        setLiveRecognitionTranscript("");
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        listeningProgressCursorRef.current = 0;
        setShowListeningCorrection(false);
        setListeningProgressCursor(0);
        setIsSpeechRecognitionRunning(false);
        setListeningScoreFx(null);
        setWordPopup(null);
        completeMarkedRef.current = false;
    }, [articleKey, clearSubmitScoreFxTimer, visible]);

    const stopCurrentTts = useCallback(() => {
        ttsRequestIdRef.current += 1;
        setIsPreparingAudio(false);
        setIsReferenceAudioPlaying(false);
        setActiveReferenceWordMarkIndex(null);
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current.currentTime = 0;
            ttsAudioRef.current.onended = null;
            ttsAudioRef.current.onpause = null;
            ttsAudioRef.current.onplay = null;
            ttsAudioRef.current.ontimeupdate = null;
            ttsAudioRef.current.onerror = null;
        }
        if (ttsAudioUrlRef.current) {
            URL.revokeObjectURL(ttsAudioUrlRef.current);
            ttsAudioUrlRef.current = null;
        }
    }, []);

    const clearSelfRecordingAudio = useCallback(() => {
        if (selfRecordAudioRef.current) {
            selfRecordAudioRef.current.pause();
            selfRecordAudioRef.current.currentTime = 0;
            selfRecordAudioRef.current.src = "";
            selfRecordAudioRef.current.onended = null;
            selfRecordAudioRef.current.onerror = null;
        }
        if (selfRecordAudioUrlRef.current) {
            URL.revokeObjectURL(selfRecordAudioUrlRef.current);
            selfRecordAudioUrlRef.current = null;
        }
        setHasSelfRecording(false);
    }, []);

    const stopSpeechRecognition = useCallback((forceAbort = false) => {
        speechRecognitionStopRequestedRef.current = true;
        const recognition = speechRecognitionRef.current;
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
                // noop: shutdown path best-effort
            }
            speechRecognitionRef.current = null;
        }
        setIsSpeechRecognitionRunning(false);
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
    }, []);

    const startSpeechRecognition = useCallback(() => {
        if (typeof window === "undefined") return false;
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            setIsSpeechRecognitionSupported(false);
            setRunnerError("当前浏览器不支持实时跟读反馈，你仍可录音并回放对比。");
            return false;
        }

        stopSpeechRecognition(true);
        speechRecognitionStopRequestedRef.current = false;
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";

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
                const transcript = normalizeWhitespace(result?.[0]?.transcript || "");
                if (!transcript) continue;

                if (result?.isFinal) {
                    finalParts.push(transcript);
                } else {
                    interimParts.push(transcript);
                }
            }

            const nextFinalTranscript = normalizeWhitespace(finalParts.join(" "));
            const nextInterimTranscript = normalizeWhitespace(interimParts.join(" "));
            speechRecognitionFinalTranscriptRef.current = nextFinalTranscript;
            speechRecognitionInterimTranscriptRef.current = nextInterimTranscript;
            const nextTranscript = normalizeWhitespace(`${nextFinalTranscript} ${nextInterimTranscript}`);
            if (!nextTranscript) return;
            setLiveRecognitionTranscript(nextTranscript);
            if (currentQuestion?.module === "listening") {
                const nextProgress = estimateListeningProgress(currentQuestion.sentence, nextTranscript);
                if (nextProgress > listeningProgressCursorRef.current) {
                    listeningProgressCursorRef.current = nextProgress;
                    setListeningProgressCursor(nextProgress);
                }
            }
        };
        recognition.onerror = (event) => {
            const errorCode = `${event?.error || ""}`.toLowerCase();
            if (!errorCode || errorCode === "aborted" || errorCode === "no-speech") {
                return;
            }
            if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
                setRunnerError("语音识别权限被拒绝，请在浏览器设置中允许麦克风后重试。");
                return;
            }
            setRunnerError(`实时跟读识别异常：${event?.error || "未知错误"}`);
        };
        recognition.onend = () => {
            if (speechRecognitionStopRequestedRef.current) {
                setIsSpeechRecognitionRunning(false);
                speechRecognitionRef.current = null;
                return;
            }

            const recorder = recorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recognition.start();
                    return;
                } catch {
                    // fall through
                }
            }

            setIsSpeechRecognitionRunning(false);
            speechRecognitionRef.current = null;
        };

        speechRecognitionRef.current = recognition;
        try {
            recognition.start();
            setIsSpeechRecognitionRunning(true);
            return true;
        } catch (error) {
            speechRecognitionRef.current = null;
            setIsSpeechRecognitionRunning(false);
            const message = error instanceof Error ? error.message : "启动实时识别失败";
            setRunnerError(message);
            return false;
        }
    }, [currentQuestion?.module, currentQuestion?.sentence, stopSpeechRecognition]);

    const playListeningScoreSfx = useCallback((tier: ListeningScoreTier) => {
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

    const playSubmitScoreSfx = useCallback((module: "writing" | "translation", tier: ListeningScoreTier) => {
        if (typeof window === "undefined") return;
        const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;

        const audioContext = new AudioContextCtor();
        const base = audioContext.currentTime;

        const scheduleTone = (frequency: number, startOffset: number, duration: number, gain = 0.12, type: OscillatorType = "triangle") => {
            const oscillator = audioContext.createOscillator();
            const amp = audioContext.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, base + startOffset);
            amp.gain.setValueAtTime(0.0001, base + startOffset);
            amp.gain.exponentialRampToValueAtTime(gain, base + startOffset + 0.015);
            amp.gain.exponentialRampToValueAtTime(0.0001, base + startOffset + duration);
            oscillator.connect(amp);
            amp.connect(audioContext.destination);
            oscillator.start(base + startOffset);
            oscillator.stop(base + startOffset + duration + 0.02);
        };

        const baseNotes = module === "writing" ? [659, 880, 1047] : [622, 831, 988];
        if (tier === "excellent") {
            scheduleTone(baseNotes[0], 0, 0.13, 0.13, "triangle");
            scheduleTone(baseNotes[1], 0.1, 0.15, 0.14, "triangle");
            scheduleTone(baseNotes[2], 0.22, 0.2, 0.15, "triangle");
            scheduleTone(baseNotes[2] * 1.5, 0.34, 0.22, 0.12, "sine");
        } else if (tier === "good") {
            scheduleTone(baseNotes[0], 0, 0.14, 0.12, "triangle");
            scheduleTone(baseNotes[1], 0.11, 0.18, 0.12, "triangle");
            scheduleTone(baseNotes[2], 0.26, 0.2, 0.11, "sine");
        } else if (tier === "ok") {
            scheduleTone(baseNotes[0], 0, 0.18, 0.11, "sine");
            scheduleTone(baseNotes[1], 0.16, 0.19, 0.1, "sine");
        } else {
            scheduleTone(392, 0, 0.14, 0.09, "sawtooth");
            scheduleTone(330, 0.12, 0.18, 0.09, "sawtooth");
        }

        window.setTimeout(() => {
            void audioContext.close().catch(() => undefined);
        }, 980);
    }, []);

    const triggerSubmitScoreFx = useCallback((params: {
        module: "writing" | "translation";
        score: number;
        title: string;
        detail: string;
    }) => {
        const tier = resolveListeningScoreTier(params.score);
        clearSubmitScoreFxTimer();
        setSubmitScoreFx({
            module: params.module,
            score: params.score,
            tier,
            title: params.title,
            detail: params.detail,
        });
        playSubmitScoreSfx(params.module, tier);
        submitScoreFxTimerRef.current = window.setTimeout(() => {
            setSubmitScoreFx((prev) => (prev?.module === params.module ? null : prev));
            submitScoreFxTimerRef.current = null;
        }, 1800);
    }, [clearSubmitScoreFxTimer, playSubmitScoreSfx]);

    const cleanupRecorderResources = useCallback(() => {
        if (recorderStreamRef.current) {
            for (const track of recorderStreamRef.current.getTracks()) {
                track.stop();
            }
        }
        recorderRef.current = null;
        recorderStreamRef.current = null;
        recorderChunksRef.current = [];
        setIsRecordingSelfVoice(false);
    }, []);

    const forceStopSelfRecorder = useCallback((discardRecording: boolean) => {
        stopSpeechRecognition(true);
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            discardRecordingOnStopRef.current = discardRecording;
            try {
                recorder.stop();
            } catch {
                cleanupRecorderResources();
            }
            return;
        }
        cleanupRecorderResources();
    }, [cleanupRecorderResources, stopSpeechRecognition]);

    useEffect(() => {
        if (!visible) {
            clearListeningAdvanceTimer();
            clearSubmitScoreFxTimer();
            stopCurrentTts();
            forceStopSelfRecorder(true);
            clearSelfRecordingAudio();
            setLiveRecognitionTranscript("");
            speechRecognitionFinalTranscriptRef.current = "";
            speechRecognitionInterimTranscriptRef.current = "";
            setIsSpeechRecognitionRunning(false);
            setIsListeningAdvancePending(false);
            setSubmitScoreFx(null);
            setWordPopup(null);
        }
    }, [clearListeningAdvanceTimer, clearSelfRecordingAudio, clearSubmitScoreFxTimer, forceStopSelfRecorder, stopCurrentTts, visible]);

    const ensureWritingPrompt = useCallback(async (question: PretestQuestion, prefetch = false) => {
        if (question.module !== "writing") return;
        if (writingPromptMap[question.id]) return;
        if (writingPromptPendingRef.current.has(question.id)) return;

        writingPromptPendingRef.current.add(question.id);
        if (!prefetch) {
            setWritingPromptLoadingId(question.id);
            setWritingPromptErrorMap((prev) => {
                if (!(question.id in prev)) return prev;
                const next = { ...prev };
                delete next[question.id];
                return next;
            });
        }

        try {
            const response = await fetch("/api/ai/rewrite-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate",
                    paragraphText: question.sentence,
                    excludedSentences: [],
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "仿写提示生成失败");
            }
            const prompt = normalizeRewritePromptPayload(payload, question.sentence);
            if (!prompt) {
                throw new Error("仿写提示为空");
            }
            setWritingPromptMap((prev) => ({ ...prev, [question.id]: prompt }));
            setWritingPromptErrorMap((prev) => {
                if (!(question.id in prev)) return prev;
                const next = { ...prev };
                delete next[question.id];
                return next;
            });
        } catch (error) {
            if (!prefetch) {
                const message = error instanceof Error ? error.message : "仿写提示生成失败";
                setWritingPromptErrorMap((prev) => ({ ...prev, [question.id]: message }));
            }
        } finally {
            writingPromptPendingRef.current.delete(question.id);
            if (!prefetch) {
                setWritingPromptLoadingId((prev) => (prev === question.id ? null : prev));
            }
        }
    }, [writingPromptMap]);

    useEffect(() => {
        if (!visible || stage !== "runner" || !currentQuestion) return;

        if (currentQuestion.module === "writing") {
            void ensureWritingPrompt(currentQuestion, false);
        }

        const nextWritingQuestion = questions
            .slice(currentIndex + 1)
            .find((question) => question.module === "writing");
        if (nextWritingQuestion) {
            void ensureWritingPrompt(nextWritingQuestion, true);
        }
    }, [currentIndex, currentQuestion, ensureWritingPrompt, questions, stage, visible]);

    useEffect(() => {
        if (!visible || stage !== "runner" || !currentQuestion || currentQuestion.module !== "translation") return;
        if (translationRefMap[currentQuestion.id]) return;

        let cancelled = false;
        setTranslationRefLoading(true);
        setTranslationRefError(null);

        void (async () => {
            try {
                const response = await fetch("/api/ai/translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: currentQuestion.sentence,
                        context: currentQuestion.sentence,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || "翻译参考获取失败");
                }
                const translation = normalizeWhitespace(payload?.translation || "");
                if (!translation) {
                    throw new Error("翻译参考为空");
                }
                if (!cancelled) {
                    setTranslationRefMap((prev) => ({ ...prev, [currentQuestion.id]: translation }));
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : "翻译参考获取失败";
                    setTranslationRefError(message);
                }
            } finally {
                if (!cancelled) {
                    setTranslationRefLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentQuestion, stage, translationRefMap, visible]);

    const hydrateTranslationDetail = useCallback(async (params: {
        questionId: string;
        sourceSentence: string;
        userTranslation: string;
        fallbackFeedback: string;
    }) => {
        try {
            const critiqueResponse = await fetch("/api/ai/critique-translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    originalText: params.sourceSentence,
                    userTranslation: params.userTranslation,
                }),
            });
            const critiquePayload = await critiqueResponse.json().catch(() => ({}));
            if (!critiqueResponse.ok) {
                throw new Error(critiquePayload?.error || "翻译详情生成失败");
            }

            const normalizedDetail = normalizeTranslationCritiquePayload(critiquePayload);
            setQuestionFeedback((prev) => {
                if (!prev || prev.module !== "translation" || !prev.translationDetail) return prev;
                if (prev.translationDetail.questionId !== params.questionId) return prev;

                const fallbackImprovements = normalizedDetail.improvement_points_cn.length > 0
                    ? normalizedDetail.improvement_points_cn
                    : (params.fallbackFeedback ? [params.fallbackFeedback] : []);

                return {
                    ...prev,
                    translationDetail: {
                        ...prev.translationDetail,
                        better_translation_cn: normalizedDetail.better_translation_cn,
                        corrections: normalizedDetail.corrections,
                        improvement_points_cn: fallbackImprovements.slice(0, 4),
                        isLoading: false,
                    },
                };
            });
        } catch {
            setQuestionFeedback((prev) => {
                if (!prev || prev.module !== "translation" || !prev.translationDetail) return prev;
                if (prev.translationDetail.questionId !== params.questionId) return prev;
                if (!prev.translationDetail.isLoading) return prev;

                return {
                    ...prev,
                    translationDetail: {
                        ...prev.translationDetail,
                        isLoading: false,
                        improvement_points_cn: prev.translationDetail.improvement_points_cn.length > 0
                            ? prev.translationDetail.improvement_points_cn
                            : (params.fallbackFeedback ? [params.fallbackFeedback] : []),
                    },
                };
            });
        }
    }, []);

    useEffect(() => {
        setShowWritingScoreDetails(false);
        setShowTranslationScoreDetails(false);
    }, [currentQuestion?.id]);

    useEffect(() => {
        if (!visible || stage !== "complete") return;
        if (!completeMarkedRef.current) {
            completeMarkedRef.current = true;
            void Promise.resolve(onMarkCompleted());
        }

        setCountdown(3);
        const timer = window.setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    window.clearInterval(timer);
                    onEnterQuiz();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, [onEnterQuiz, onMarkCompleted, stage, visible]);

    useEffect(() => {
        return () => {
            clearListeningAdvanceTimer();
            clearSubmitScoreFxTimer();
            stopCurrentTts();
            forceStopSelfRecorder(true);
            clearSelfRecordingAudio();
        };
    }, [clearListeningAdvanceTimer, clearSelfRecordingAudio, clearSubmitScoreFxTimer, forceStopSelfRecorder, stopCurrentTts]);

    const moveToNextQuestion = () => {
        clearListeningAdvanceTimer();
        clearSubmitScoreFxTimer();
        stopCurrentTts();
        forceStopSelfRecorder(true);
        clearSelfRecordingAudio();
        if (currentIndex >= questions.length - 1) {
            setStage("complete");
            return;
        }
        setCurrentIndex((prev) => prev + 1);
        setAnswerDraft("");
        setQuestionFeedback(null);
        setRunnerError(null);
        setIsListeningAdvancePending(false);
        setReferenceWordMarks([]);
        setActiveReferenceWordMarkIndex(null);
        setIsReferenceAudioPlaying(false);
        setLiveRecognitionTranscript("");
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        listeningProgressCursorRef.current = 0;
        setShowListeningCorrection(false);
        setListeningProgressCursor(0);
        setIsSpeechRecognitionRunning(false);
        setListeningScoreFx(null);
        setSubmitScoreFx(null);
        setWordPopup(null);
    };

    const commitRecord = (nextRecord: PretestRecord) => {
        setRecords((prev) => ({
            ...prev,
            [nextRecord.questionId]: nextRecord,
        }));
    };

    const handleSkipQuestion = () => {
        if (isListeningAdvancePending) return;
        if (!currentQuestion) return;
        commitRecord({
            questionId: currentQuestion.id,
            module: currentQuestion.module,
            skipped: true,
            answer: "",
        });
        moveToNextQuestion();
    };

    const handleSubmitQuestion = async () => {
        if (!currentQuestion) return;
        const answer = normalizeWhitespace(answerDraft);

        if (currentQuestion.module === "listening") {
            return;
        }

        if (!answer) {
            setRunnerError("请输入你的答案再提交。");
            return;
        }

        setRunnerError(null);
        setIsSubmitting(true);

        try {
            if (currentQuestion.module === "writing") {
                const writingPrompt = writingPromptMap[currentQuestion.id];
                const response = await fetch("/api/ai/rewrite-practice", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "score",
                        source_sentence_en: currentQuestion.sentence,
                        imitation_prompt_cn: writingPrompt?.imitation_prompt_cn || "请在保持原意的前提下，改写这个句子。",
                        user_rewrite_en: answer,
                        strict_semantic_match: false,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || "仿写评分失败");
                }
                const rewriteScore = normalizeRewriteScorePayload(payload);
                const feedback = rewriteScore.feedback_cn;

                commitRecord({
                    questionId: currentQuestion.id,
                    module: currentQuestion.module,
                    skipped: false,
                    answer,
                    score: rewriteScore.total_score,
                    feedback,
                });
                setQuestionFeedback({
                    module: "writing",
                    scoreLabel: `AI评分 ${rewriteScore.total_score}/100`,
                    feedback,
                    rewriteScore,
                });
                triggerSubmitScoreFx({
                    module: "writing",
                    score: rewriteScore.total_score,
                    title: "仿写评分完成",
                    detail: `总分 ${rewriteScore.total_score}/100`,
                });
                return;
            }

            const translationRef = normalizeWhitespace(
                translationRefMap[currentQuestion.id] || "",
            );
            if (!translationRef) {
                throw new Error("翻译参考尚未准备好，请稍后再试。");
            }

            const scoreResponse = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "translation",
                    is_reverse: true,
                    input_source: "keyboard",
                    teaching_mode: false,
                    user_translation: answer,
                    reference_english: currentQuestion.sentence,
                    original_chinese: translationRef,
                    current_elo: Number.isFinite(Number(currentElo)) ? Number(currentElo) : 1200,
                }),
            });
            const payload = await scoreResponse.json().catch(() => ({}));
            if (!scoreResponse.ok) {
                throw new Error(payload?.error || "翻译评分失败");
            }
            const boundedScore = clampScore10(payload?.score);
            const feedback = typeof payload?.judge_reasoning === "string" && payload.judge_reasoning.trim()
                ? payload.judge_reasoning.trim()
                : "已完成翻译评分。";

            commitRecord({
                questionId: currentQuestion.id,
                module: currentQuestion.module,
                skipped: false,
                answer,
                score: boundedScore * 10,
                feedback,
            });
            setQuestionFeedback({
                module: "translation",
                scoreLabel: `AI评分 ${boundedScore.toFixed(1)}/10`,
                feedback,
                translationDetail: {
                    questionId: currentQuestion.id,
                    source_sentence_en: currentQuestion.sentence,
                    reference_translation_cn: translationRef,
                    user_translation_cn: answer,
                    score_10: boundedScore,
                    judge_reasoning_cn: feedback,
                    better_translation_cn: "",
                    improvement_points_cn: [],
                    corrections: [],
                    isLoading: true,
                },
            });
            triggerSubmitScoreFx({
                module: "translation",
                score: Math.round(boundedScore * 10),
                title: "翻译评分完成",
                detail: `总分 ${boundedScore.toFixed(1)}/10`,
            });
            void hydrateTranslationDetail({
                questionId: currentQuestion.id,
                sourceSentence: currentQuestion.sentence,
                userTranslation: answer,
                fallbackFeedback: feedback,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "提交失败";
            setRunnerError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleListeningSubmit = () => {
        if (!currentQuestion || currentQuestion.module !== "listening") return;
        if (isListeningAdvancePending) return;
        if (questionFeedback) return;
        if (isRecordingSelfVoice) {
            setRunnerError("请先停止录音，再提交评分。");
            return;
        }
        const recognitionTranscript = normalizeWhitespace(speechRecognitionFinalTranscriptRef.current)
            || normalizeWhitespace(liveRecognitionTranscript);
        const metrics = scoreListeningRecognition(currentQuestion.sentence, recognitionTranscript);
        if (!metrics.spokenCount) {
            setRunnerError("先开始录音并跟读一遍，再提交评分。");
            return;
        }

        const score = metrics.score;
        const tier = resolveListeningScoreTier(score);
        const title = tier === "excellent"
            ? "太稳了！"
            : tier === "good"
                ? "表现不错！"
                : tier === "ok"
                    ? "继续冲！"
                    : "再来一遍更好";
        const detail = `匹配 ${metrics.correctCount}/${Math.max(1, metrics.totalCount)} 个词，系统自动评分 ${score}/100`;

        commitRecord({
            questionId: currentQuestion.id,
            module: currentQuestion.module,
            skipped: false,
            answer: recognitionTranscript,
            score,
            feedback: detail,
        });
        setQuestionFeedback({
            module: "listening",
            scoreLabel: `跟读评分 ${score}/100`,
            feedback: detail,
        });
        setShowListeningCorrection(true);
        setListeningScoreFx({ score, tier, title, detail });
        playListeningScoreSfx(tier);
        setRunnerError(null);
    };

    const playCurrentSentence = async () => {
        if (!currentQuestion) return;
        const text = normalizeWhitespace(currentQuestion.sentence);
        if (!text) return;
        const requestId = ttsRequestIdRef.current + 1;
        ttsRequestIdRef.current = requestId;
        setRunnerError(null);
        setIsPreparingAudio(true);

        try {
            const payload = await requestTtsPayload(text);
            if (ttsRequestIdRef.current !== requestId) return;
            const normalizedMarks = (Array.isArray(payload.marks) ? payload.marks : [])
                .filter((mark): mark is TtsWordMark => {
                    if (!mark || typeof mark.value !== "string") return false;
                    const hasStart = Number.isFinite(Number(mark.start));
                    const hasEnd = Number.isFinite(Number(mark.end));
                    return hasStart && hasEnd;
                })
                .sort((left, right) => Number(left.start) - Number(right.start));
            setReferenceWordMarks(normalizedMarks);
            setActiveReferenceWordMarkIndex(null);
            const blob = await resolveTtsAudioBlob(payload.audioDataUrl || payload.audio);
            if (ttsRequestIdRef.current !== requestId) return;

            const audio = ttsAudioRef.current ?? new Audio();
            ttsAudioRef.current = audio;

            audio.pause();
            audio.currentTime = 0;
            if (ttsAudioUrlRef.current) {
                URL.revokeObjectURL(ttsAudioUrlRef.current);
                ttsAudioUrlRef.current = null;
            }

            const objectUrl = URL.createObjectURL(blob);
            ttsAudioUrlRef.current = objectUrl;
            audio.src = objectUrl;
            audio.onended = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setIsReferenceAudioPlaying(false);
                    setActiveReferenceWordMarkIndex(null);
                }
            };
            audio.onpause = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setIsReferenceAudioPlaying(false);
                    setActiveReferenceWordMarkIndex(null);
                }
            };
            audio.onplay = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setIsReferenceAudioPlaying(true);
                }
            };
            audio.ontimeupdate = () => {
                if (ttsRequestIdRef.current !== requestId) return;
                if (normalizedMarks.length === 0) {
                    setActiveReferenceWordMarkIndex(null);
                    return;
                }

                const currentMs = audio.currentTime * 1000;
                let activeMarkIndex = -1;
                for (let index = 0; index < normalizedMarks.length; index += 1) {
                    const mark = normalizedMarks[index];
                    const startMs = Number(mark.start);
                    const rawEndMs = Number(mark.end);
                    const endMs = Number.isFinite(rawEndMs) && rawEndMs > startMs ? rawEndMs : startMs + 220;
                    if (currentMs >= startMs && currentMs < endMs) {
                        activeMarkIndex = index;
                        break;
                    }
                    if (currentMs < startMs) break;
                }
                setActiveReferenceWordMarkIndex(activeMarkIndex >= 0 ? activeMarkIndex : null);
            };
            audio.onerror = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setRunnerError("音频播放失败，请重试。");
                    setIsPreparingAudio(false);
                    setIsReferenceAudioPlaying(false);
                    setActiveReferenceWordMarkIndex(null);
                }
            };
            await audio.play();
            if (ttsRequestIdRef.current === requestId) {
                setIsPreparingAudio(false);
                setIsReferenceAudioPlaying(true);
            }
        } catch (error) {
            if (ttsRequestIdRef.current !== requestId) return;
            const message = error instanceof Error ? error.message : "语音加载失败，请重试。";
            setRunnerError(message);
            setIsPreparingAudio(false);
            setIsReferenceAudioPlaying(false);
            setActiveReferenceWordMarkIndex(null);
        }
    };

    const startSelfRecording = async () => {
        if (typeof window === "undefined" || !currentQuestion || currentQuestion.module !== "listening") return;
        if (isListeningAdvancePending) return;
        if (isRecordingSelfVoice) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            setRunnerError("当前浏览器不支持录音，请更换浏览器后再试。");
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            setRunnerError("当前环境不支持录音组件，请更换浏览器后再试。");
            return;
        }

        stopCurrentTts();
        clearSelfRecordingAudio();
        setRunnerError(null);
        setListeningScoreFx(null);
        setLiveRecognitionTranscript("");
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        listeningProgressCursorRef.current = 0;
        setShowListeningCorrection(false);
        setListeningProgressCursor(0);

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

            recorderRef.current = recorder;
            recorderStreamRef.current = stream;
            recorderChunksRef.current = [];
            discardRecordingOnStopRef.current = false;

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    recorderChunksRef.current.push(event.data);
                }
            };
            recorder.onerror = () => {
                setRunnerError("录音失败，请重试。");
            };
            recorder.onstop = () => {
                const shouldDiscard = discardRecordingOnStopRef.current;
                discardRecordingOnStopRef.current = false;
                const blob = new Blob(
                    recorderChunksRef.current,
                    { type: recorder.mimeType || "audio/webm" },
                );
                cleanupRecorderResources();
                if (shouldDiscard || blob.size <= 0) return;

                const objectUrl = URL.createObjectURL(blob);
                selfRecordAudioUrlRef.current = objectUrl;
                if (!selfRecordAudioRef.current) {
                    selfRecordAudioRef.current = new Audio();
                }
                selfRecordAudioRef.current.src = objectUrl;
                selfRecordAudioRef.current.currentTime = 0;
                setHasSelfRecording(true);
            };
            recorder.start();
            setIsRecordingSelfVoice(true);
            startSpeechRecognition();
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.toLowerCase().includes("notallowed") || message.toLowerCase().includes("permission")) {
                setRunnerError("麦克风权限被拒绝，请在浏览器设置里允许后重试。");
            } else {
                setRunnerError(message || "麦克风权限获取失败，请检查浏览器设置。");
            }
            cleanupRecorderResources();
        }
    };

    const stopSelfRecording = () => {
        if (isListeningAdvancePending) return;
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        stopSpeechRecognition();
        discardRecordingOnStopRef.current = false;
        setShowListeningCorrection(true);
        try {
            recorder.stop();
        } catch (error) {
            const message = error instanceof Error ? error.message : "停止录音失败，请重试。";
            setRunnerError(message);
            cleanupRecorderResources();
        }
    };

    const playSelfRecording = async () => {
        if (isListeningAdvancePending) return;
        if (!hasSelfRecording || !selfRecordAudioUrlRef.current) {
            setRunnerError("还没有录音，先点“开始录音”试试。");
            return;
        }
        setRunnerError(null);
        try {
            const audio = selfRecordAudioRef.current ?? new Audio();
            selfRecordAudioRef.current = audio;
            audio.pause();
            audio.currentTime = 0;
            audio.src = selfRecordAudioUrlRef.current;
            await audio.play();
        } catch (error) {
            const message = error instanceof Error ? error.message : "录音播放失败，请重试。";
            setRunnerError(message);
        }
    };

    const shouldHighlightSourceSentence = currentQuestion?.module === "listening"
        && (isRecordingSelfVoice || isReferenceAudioPlaying || isListeningAdvancePending);
    const liveListeningMetrics = useMemo(
        () => scoreListeningRecognition(
            currentQuestion?.module === "listening" ? currentQuestion.sentence : "",
            liveRecognitionTranscript,
        ),
        [currentQuestion?.module, currentQuestion?.sentence, liveRecognitionTranscript],
    );

    if (!visible) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="read-pretest-overlay"
                className="fixed inset-0 z-[95] flex items-center justify-center px-4 py-6"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.12 : 0.24 }}
            >
                <div className="absolute inset-0 bg-[#2b2a28]/40 backdrop-blur-[5px]" onClick={onClose} />

                <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    transition={{ duration: prefersReducedMotion ? 0.16 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                        "relative z-[1] w-full overflow-hidden rounded-[2rem] border-[3px] border-[#17120d] bg-[#fff8ef] text-[#2f2a26] shadow-[0_12px_0_rgba(23,18,13,0.12)]",
                        stage === "runner" ? "max-w-4xl" : "max-w-3xl",
                    )}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className="ui-pressable absolute !left-auto !right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#17120d] bg-white text-[#6a6055]"
                        style={{
                            ...getPressableStyle("rgba(23,18,13,0.1)", 3),
                            position: "absolute",
                            left: "unset",
                            right: "1rem",
                            top: "1rem",
                            insetInlineStart: "unset",
                            insetInlineEnd: "1rem",
                        }}
                        aria-label="关闭前测"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {stage === "confirm" && (
                        <section className="px-6 pb-7 pt-8 md:px-10">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#f4d2e0] bg-[#fff0f7] px-3 py-1 text-xs font-black text-[#c45f95]">
                                <Sparkles className="h-3.5 w-3.5" />
                                PRE-TEST
                            </div>
                            <h3 className="mt-4 text-3xl font-black tracking-[-0.02em] text-[#5a3f30]">进入完整测试？</h3>
                            <p className="mt-3 text-sm leading-7 text-[#6f6458] md:text-base">
                                先完成听 / 写 / 译小测试，可帮助你更稳进入答题状态。该测试不影响 CAT 分。
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2.5">
                                <span className="rounded-full border border-[#c8e4ff] bg-[#eef7ff] px-3 py-1.5 text-xs font-black text-[#2f66f3]">听5题</span>
                                <span className="rounded-full border border-[#bfead4] bg-[#f0fff7] px-3 py-1.5 text-xs font-black text-[#1f9a67]">写3题</span>
                                <span className="rounded-full border border-[#decfff] bg-[#f7f2ff] px-3 py-1.5 text-xs font-black text-[#7a58e8]">译3题</span>
                            </div>
                            <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setStage("hub")}
                                    className="ui-pressable rounded-[1.2rem] border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-4 py-3.5 text-sm font-black text-white"
                                    style={getPressableStyle("rgba(207,135,93,0.92)", 5)}
                                >
                                    是，进入完整测试
                                </button>
                                <button
                                    type="button"
                                    onClick={onDirectQuiz}
                                    className="ui-pressable rounded-[1.2rem] border-[3px] border-[#17120d] bg-white px-4 py-3.5 text-sm font-black text-[#4d4338]"
                                    style={getPressableStyle("rgba(23,18,13,0.08)", 5)}
                                >
                                    否，直接答题
                                </button>
                            </div>
                            <p className="mt-5 text-xs text-[#8b7f72]">
                                同一篇完成一次后，下次默认不再强提醒
                            </p>
                        </section>
                    )}

                    {stage === "hub" && (
                        <section className="px-6 pb-7 pt-8 md:px-10">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9b8a78]">READ PRE-TEST</p>
                            <h3 className="mt-2 text-3xl font-black tracking-[-0.02em] text-[#5a3f30]">阅读前测</h3>
                            <p className="mt-2 line-clamp-1 text-sm text-[#7a6d60]">{articleTitle}</p>
                            <div className="mt-6 grid grid-cols-1 gap-3">
                                {MODULE_ORDER.map((moduleType) => {
                                    const meta = MODULE_META[moduleType];
                                    const Icon = meta.icon;
                                    const stats = moduleStats[moduleType];
                                    const completed = stats.done >= stats.total && stats.total > 0;
                                    return (
                                        <div
                                            key={moduleType}
                                            className="rounded-[1.3rem] border-[3px] border-[#e7ddcf] bg-white/70 px-4 py-3.5"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm", meta.chipClass)}>
                                                        <Icon className="h-4 w-4" />
                                                    </span>
                                                    <div>
                                                        <p className="text-sm font-black text-[#4d4338]">{meta.title}</p>
                                                        <p className="text-xs text-[#857868]">{meta.subtitle}</p>
                                                    </div>
                                                </div>
                                                <span className={cn(
                                                    "rounded-full border px-3 py-1 text-xs font-black",
                                                    completed
                                                        ? "border-[#9fdfba] bg-[#e9fff2] text-[#22814f]"
                                                        : stats.done > 0
                                                            ? "border-[#f5ddb7] bg-[#fff3df] text-[#9f6c27]"
                                                            : "border-[#e1d8cc] bg-[#f9f5ef] text-[#7a6d60]",
                                                )}>
                                                    {completed ? "已完成" : stats.done > 0 ? "进行中" : "未开始"}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 rounded-[1.2rem] border-[3px] border-[#ece3d5] bg-[#fffdf8] p-4 text-sm text-[#75695d]">
                                已完成 {completedCount}/{totalQuestions} · 跳过 {skippedCount} 题 · 仅作测试，不影响 CAT 分
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setStage("runner")}
                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-6 py-3 text-sm font-black text-white"
                                    style={getPressableStyle("rgba(207,135,93,0.92)", 5)}
                                >
                                    {completedCount > 0 ? "继续测试" : "开始测试"}
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </section>
                    )}

                    {stage === "runner" && currentQuestion && (
                        <section className="px-4 pb-5 pt-6 md:px-6 md:pb-6 md:pt-7">
                            <div className="rounded-[1.3rem] border-[3px] border-[#eadfce] bg-white/80 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black", MODULE_META[currentQuestion.module].chipClass)}>
                                            {(() => {
                                                const Icon = MODULE_META[currentQuestion.module].icon;
                                                return <Icon className="h-3.5 w-3.5" />;
                                            })()}
                                            {MODULE_META[currentQuestion.module].title}
                                        </span>
                                        <span className="text-xs font-black text-[#897b6b]">
                                            {currentQuestion.moduleIndex}/{currentQuestion.moduleTotal}
                                        </span>
                                    </div>
                                    <span className="rounded-full border border-[#ddd1c0] bg-[#f8f3ea] px-2.5 py-1 text-[11px] font-black text-[#7a6d60]">
                                        {currentQuestion.globalIndex}/{currentQuestion.globalTotal}
                                    </span>
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-[#efe7da]">
                                    <div
                                        className="h-full rounded-full bg-[linear-gradient(90deg,#f3ad86,#e58a62)]"
                                        style={{ width: `${Math.max(6, (currentQuestion.globalIndex / Math.max(1, currentQuestion.globalTotal)) * 100)}%` }}
                                    />
                                </div>
                            </div>

                            {!shouldHideSentencePanel && (
                                <div className="mt-4 rounded-[1.4rem] border-[3px] border-[#e9dfd1] bg-white/90 px-4 py-5 md:px-6">
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a18f7b]">source sentence</p>
                                <p
                                    data-word-popup-root={currentQuestion.module === "listening" ? "true" : undefined}
                                    onMouseUp={handleListeningSentenceMouseUp}
                                    className={cn(
                                        "mt-3 rounded-[0.95rem] px-2 py-1 font-bold text-[#3a322c] transition-all duration-250",
                                        isWritingScored
                                            ? "text-base leading-7 md:text-[1.15rem] md:leading-8"
                                            : "text-lg leading-8 md:text-[1.55rem] md:leading-[2.2rem]",
                                        shouldHighlightSourceSentence
                                            ? "bg-[#fff4cf] shadow-[0_0_0_2px_rgba(243,184,84,0.35),0_10px_24px_rgba(243,184,84,0.16)]"
                                            : "",
                                    )}
                                >
                                    {currentQuestion.module === "listening" ? sourceSentenceKaraokeContent : currentQuestion.sentence}
                                </p>

                                {isWritingScored && (
                                    <div className="mt-3 rounded-[0.85rem] border border-[#eadfce] bg-[#fffdf8] px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#9b8a78]">your rewrite</p>
                                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#5a5148]">
                                            {normalizeWhitespace(answerDraft) || "（本题未检测到作答文本）"}
                                        </p>
                                    </div>
                                )}

                                {currentQuestion.module === "listening" && (
                                    <>
                                        <ListeningShadowingControls
                                            onPlayReference={playCurrentSentence}
                                            onToggleRecording={isRecordingSelfVoice ? stopSelfRecording : startSelfRecording}
                                            onPlaySelfRecording={playSelfRecording}
                                            onSubmit={handleListeningSubmit}
                                            isReferencePreparing={isPreparingAudio}
                                            isReferenceDisabled={isRecordingSelfVoice || isListeningAdvancePending}
                                            isRecording={isRecordingSelfVoice}
                                            isRecordToggleDisabled={isPreparingAudio || isListeningAdvancePending}
                                            hasSelfRecording={hasSelfRecording}
                                            isPlaySelfDisabled={isListeningAdvancePending}
                                            isSubmitted={Boolean(questionFeedback)}
                                            isSubmitDisabled={isListeningAdvancePending || !normalizeWhitespace(liveRecognitionTranscript) || Boolean(questionFeedback)}
                                            helperText="先听原句再跟读；录音结束后点“提交跟读评分”，系统给分后由你手动进入下一题。"
                                            progressLabel={isRecordingSelfVoice
                                                ? `进度 ${listeningProgressCount}/${sourceTokens.length || 0}`
                                                : shouldShowPostRecordingCorrection
                                                    ? `纠正 ${liveListeningMetrics.correctCount}/${liveListeningMetrics.totalCount || 0}`
                                                    : "等待录音"}
                                            recognitionLabel={isSpeechRecognitionRunning
                                                ? "跟读追踪中"
                                                : shouldShowPostRecordingCorrection
                                                    ? "已生成纠正"
                                                    : "识别待机"}
                                            transcriptText={isRecordingSelfVoice
                                                ? (liveRecognitionTranscript || "正在追踪你读到的位置...")
                                                : shouldShowPostRecordingCorrection
                                                    ? (liveRecognitionTranscript || "已完成本次录音纠正。")
                                                    : "开始录音后，会实时跟踪你读到哪里；停止后才显示纠正。"}
                                            isSpeechRecognitionSupported={isSpeechRecognitionSupported}
                                        />
                                        <AnimatePresence>
                                            {listeningScoreFx && (
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
                                                        "relative w-full overflow-hidden rounded-[1rem] border-[3px] px-3 py-2.5 shadow-[0_10px_0_rgba(19,14,10,0.09),0_20px_28px_rgba(0,0,0,0.08)]",
                                                        listeningScoreFx.tier === "excellent"
                                                            ? "border-[#8ed7ad] bg-[#eafff1] text-[#155738]"
                                                            : listeningScoreFx.tier === "good"
                                                                ? "border-[#b9d8ff] bg-[#eef6ff] text-[#1f4b8f]"
                                                                : listeningScoreFx.tier === "ok"
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
                                                    <p className="text-sm font-black">{listeningScoreFx.title} · {listeningScoreFx.score}/100</p>
                                                    <p className="mt-1 text-xs font-semibold">{listeningScoreFx.detail}</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </>
                                )}

                                {currentQuestion.module === "writing" && !isWritingScored && (
                                    <div className="mt-4 space-y-3">
                                        {writingPromptLoadingId === currentQuestion.id && !currentWritingPrompt && (
                                            <div className="rounded-[1rem] border border-[#d5dff2] bg-[#f7faff] px-3 py-2.5 text-xs font-semibold text-[#5a6293]">
                                                正在生成仿写提示...
                                            </div>
                                        )}

                                        {currentWritingPromptError && (
                                            <div className="rounded-[1rem] border border-[#f2cfcf] bg-[#fff5f5] px-3 py-2.5 text-xs font-semibold text-[#b35757]">
                                                {currentWritingPromptError}
                                            </div>
                                        )}

                                        {currentWritingPrompt && (
                                            <>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="rounded-[1rem] border border-[#bfead4] bg-[#f0fff7] px-3 py-2.5">
                                                        <div className="flex items-center gap-2 text-[#1f9a67]">
                                                            <Lightbulb className="h-3.5 w-3.5" />
                                                            <p className="text-[11px] font-black uppercase tracking-[0.14em]">Inspiration</p>
                                                        </div>
                                                        <p className="mt-1.5 text-xs font-semibold leading-6 text-[#24644a]">
                                                            {currentWritingPrompt.imitation_prompt_cn}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-[1rem] border border-[#d8ccff] bg-[#f7f2ff] px-3 py-2.5">
                                                        <div className="flex items-center gap-2 text-[#7253d6]">
                                                            <GitBranch className="h-3.5 w-3.5" />
                                                            <p className="text-[11px] font-black uppercase tracking-[0.14em]">Structure Focus</p>
                                                        </div>
                                                        <p className="mt-1.5 text-xs font-semibold leading-6 text-[#4b3b80]">
                                                            {currentWritingPrompt.pattern_focus_cn}
                                                        </p>
                                                    </div>
                                                </div>

                                                {currentWritingPrompt.rewrite_tips_cn.length > 0 && (
                                                    <div className="rounded-[1rem] border border-[#e3dccf] bg-[#fffdf8] px-3 py-2.5">
                                                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7a6d60]">
                                                            Expert Advice
                                                        </p>
                                                        <div className="mt-2 space-y-1.5">
                                                            {currentWritingPrompt.rewrite_tips_cn.slice(0, 2).map((tip, index) => (
                                                                <div key={`${tip}-${index}`} className="flex items-center gap-2 text-xs font-semibold text-[#615649]">
                                                                    <CheckCircle2 className="h-3.5 w-3.5 text-[#5f84ff]" />
                                                                    <span>{tip}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {currentQuestion.module === "translation" && !isTranslationScored && (
                                    <div className="mt-4 rounded-[1rem] border border-[#dfd2ff] bg-[#f7f2ff] px-3 py-2.5 text-xs font-semibold text-[#6f5c9e]">
                                        {translationRefLoading
                                            ? "正在准备翻译参考..."
                                            : translationRefError
                                                ? `翻译参考加载失败：${translationRefError}`
                                                : "请将上面英文句子翻译成中文。"}
                                    </div>
                                )}

                                {currentQuestion.module !== "listening"
                                    && !(currentQuestion.module === "writing" && isWritingScored)
                                    && !(currentQuestion.module === "translation" && isTranslationScored) && (
                                    <textarea
                                        value={answerDraft}
                                        onChange={(event) => setAnswerDraft(event.target.value)}
                                        placeholder={
                                            currentQuestion.module === "translation"
                                                ? "输入你的中文翻译..."
                                                : "输入你的英文仿写..."
                                        }
                                        className="mt-4 h-32 w-full resize-none rounded-[1rem] border-[3px] border-[#ece0ce] bg-[#fffdf8] px-4 py-3 text-sm font-medium text-[#3a322c] outline-none transition focus:border-[#e0c39b]"
                                    />
                                )}
                                </div>
                            )}

                            {runnerError && (
                                <div className="mt-3 rounded-[1rem] border-2 border-[#f5b2b2] bg-[#fff1f1] px-3 py-2 text-sm font-semibold text-[#b93a3a]">
                                    {runnerError}
                                </div>
                            )}

                            <AnimatePresence>
                                {submitScoreFx && (
                                    <motion.div
                                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.84 }}
                                        animate={
                                            prefersReducedMotion
                                                ? { opacity: 1 }
                                                : {
                                                    opacity: [0, 1, 1],
                                                    y: [28, -6, 0],
                                                    scale: [0.84, 1.12, 1],
                                                }
                                        }
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.94 }}
                                        transition={{ duration: prefersReducedMotion ? 0.14 : 0.62, ease: [0.2, 1, 0.32, 1] }}
                                        className={cn(
                                            "relative mt-3 overflow-hidden rounded-[1rem] border-[3px] px-3 py-2.5 shadow-[0_12px_0_rgba(19,14,10,0.11),0_20px_30px_rgba(0,0,0,0.1)]",
                                            submitScoreFx.module === "writing"
                                                ? "border-[#9fd8b3] bg-[linear-gradient(180deg,#edfff4,#dbf8e9)] text-[#155738]"
                                                : "border-[#cabdff] bg-[linear-gradient(180deg,#f6f2ff,#ebe5ff)] text-[#4f3c8f]",
                                            submitScoreFx.tier === "excellent"
                                                ? "ring-4 ring-[#ffd47a]/70"
                                                : submitScoreFx.tier === "good"
                                                    ? "ring-2 ring-[#ffd47a]/45"
                                                    : "",
                                        )}
                                    >
                                        <motion.div
                                            aria-hidden
                                            initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0.45 }}
                                            animate={prefersReducedMotion ? { opacity: 0 } : { scale: 1.7, opacity: 0 }}
                                            transition={{ duration: 0.75, ease: "easeOut" }}
                                            className={cn(
                                                "pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-xl",
                                                submitScoreFx.module === "writing" ? "bg-[#87d8a8]/70" : "bg-[#a68cff]/70",
                                            )}
                                        />
                                        <p className="text-sm font-black">{submitScoreFx.title}</p>
                                        <p className="mt-1 text-xs font-semibold">{submitScoreFx.detail}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {questionFeedback?.module === "writing" && questionFeedback.rewriteScore ? (
                                <div className="mt-3 space-y-2.5 rounded-[1rem] border-[3px] border-[#c9e6d7] bg-[#f5fff9] px-3 py-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-[#15744a]">{questionFeedback.scoreLabel}</p>
                                            <p className={cn("mt-1 text-xs text-[#2f5d46]", showWritingScoreDetails ? "" : "line-clamp-2")}>
                                                {questionFeedback.feedback}
                                            </p>
                                        </div>
                                        {(shouldShowWritingImprovementPoints || hasWritingCorrections) && (
                                            <button
                                                type="button"
                                                onClick={() => setShowWritingScoreDetails((prev) => !prev)}
                                                className="ui-pressable rounded-full border-2 border-[#97cdb3] bg-white px-3 py-1 text-xs font-black text-[#1c7a4e]"
                                                style={getPressableStyle("rgba(109,189,143,0.4)", 2)}
                                            >
                                                {showWritingScoreDetails ? "收起详情" : "展开详情"}
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                                        {[
                                            { label: "语法", value: questionFeedback.rewriteScore.dimension_scores.grammar },
                                            { label: "词汇", value: questionFeedback.rewriteScore.dimension_scores.vocabulary },
                                            { label: "表达", value: questionFeedback.rewriteScore.dimension_scores.semantics },
                                            { label: "仿写度", value: questionFeedback.rewriteScore.dimension_scores.imitation },
                                        ].map((item) => (
                                            <div key={item.label} className="rounded-[0.7rem] border border-[#d8ebe0] bg-white/80 px-2 py-1.5 text-center">
                                                <p className="text-[10px] font-black tracking-[0.08em] text-[#7a6d60]">{item.label}</p>
                                                <p className="mt-0.5 text-sm font-black text-[#214a36]">{item.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="rounded-[0.75rem] border border-[#dfd5c6] bg-[#fff8ee] px-3 py-1.5 text-xs font-semibold text-[#7c6142]">
                                        相似度 {Math.round(questionFeedback.rewriteScore.copy_similarity * 100)}%
                                        {questionFeedback.rewriteScore.copy_penalty_applied ? "，已触发仿写度降分。" : "，未触发照抄惩罚。"}
                                    </div>

                                    {showWritingScoreDetails && shouldShowWritingImprovementPoints && (
                                        <div className="rounded-[0.8rem] border border-[#e1d8ff] bg-[#f8f4ff] px-3 py-2">
                                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#6f5c9e]">提升建议</p>
                                            <div className="mt-1.5 space-y-1 text-xs font-semibold text-[#4b3f74]">
                                                {questionFeedback.rewriteScore.improvement_points_cn.slice(0, 3).map((point, index) => (
                                                    <p key={`${point}-${index}`}>{index + 1}. {point}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {showWritingScoreDetails && hasWritingCorrections && (
                                        <div className="rounded-[0.8rem] border border-[#f1d6b5] bg-[#fff6e9] px-3 py-2">
                                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#9a6700]">
                                                批改修订（已合并提升建议）
                                            </p>
                                            <div className="mt-1.5 space-y-1.5">
                                                {writingCorrections.slice(0, 3).map((item, index) => (
                                                    <div key={`${item.segment}-${index}`} className="rounded-[0.7rem] border border-[#f3e1c9] bg-white/75 px-2.5 py-1.5">
                                                        <p className="text-xs font-black text-[#935d11]">{item.segment} → {item.correction}</p>
                                                        <p className="mt-0.5 text-xs font-medium text-[#6b5940]">{item.reason}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : questionFeedback?.module === "translation" && translationDetail ? (
                                <div className="mt-3 space-y-2.5 rounded-[1rem] border-[3px] border-[#cabdff] bg-[#f6f2ff] px-3 py-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-[#4d3b9a]">{questionFeedback.scoreLabel}</p>
                                            <p className={cn("mt-1 text-xs text-[#57488f]", showTranslationScoreDetails ? "" : "line-clamp-2")}>
                                                {questionFeedback.feedback}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowTranslationScoreDetails((prev) => !prev)}
                                            className="ui-pressable rounded-full border-2 border-[#b9acef] bg-white px-3 py-1 text-xs font-black text-[#4b3f86]"
                                            style={getPressableStyle("rgba(143,122,228,0.35)", 2)}
                                        >
                                            {showTranslationScoreDetails ? "收起详情" : "展开详情"}
                                        </button>
                                    </div>

                                    {showTranslationScoreDetails && (
                                        <div className="space-y-2">
                                            <div className="rounded-[0.78rem] border border-[#ddd5f7] bg-white/85 px-3 py-2">
                                                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#6d60a4]">你的翻译</p>
                                                <p className="mt-1 text-xs font-semibold text-[#4f467d]">{translationDetail.user_translation_cn}</p>
                                            </div>
                                            <div className="rounded-[0.78rem] border border-[#ddd5f7] bg-white/85 px-3 py-2">
                                                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#6d60a4]">参考译文（对照）</p>
                                                <p className="mt-1 text-xs font-semibold text-[#4f467d]">{translationDetail.reference_translation_cn}</p>
                                            </div>
                                            {hasDistinctTranslationRecommendation && (
                                                <div className="rounded-[0.78rem] border border-[#cde5d8] bg-[#effff6] px-3 py-2">
                                                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#2c7a54]">推荐译文</p>
                                                    <p className="mt-1 text-xs font-semibold text-[#20573e]">{translationDetail.better_translation_cn}</p>
                                                </div>
                                            )}

                                            {translationDetail.isLoading ? (
                                                <div className="rounded-[0.78rem] border border-[#ddd5f7] bg-white/85 px-3 py-2 text-xs font-semibold text-[#6d60a4]">
                                                    正在生成批改详情...
                                                </div>
                                            ) : null}

                                            {!translationDetail.isLoading && showTranslationScoreDetails && shouldShowTranslationImprovementPoints && (
                                                <div className="rounded-[0.8rem] border border-[#e1d8ff] bg-[#f8f4ff] px-3 py-2">
                                                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#6f5c9e]">提升建议</p>
                                                    <div className="mt-1.5 space-y-1 text-xs font-semibold text-[#4b3f74]">
                                                        {translationDetail.improvement_points_cn.slice(0, 3).map((point, index) => (
                                                            <p key={`${point}-${index}`}>{index + 1}. {point}</p>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {!translationDetail.isLoading && hasTranslationCorrections && (
                                                <div className="rounded-[0.8rem] border border-[#f1d6b5] bg-[#fff6e9] px-3 py-2">
                                                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#9a6700]">
                                                        批改修订（已合并提升建议）
                                                    </p>
                                                    <div className="mt-1.5 space-y-1.5">
                                                        {translationCorrections.slice(0, 3).map((item, index) => (
                                                            <div key={`${item.segment}-${index}`} className="rounded-[0.7rem] border border-[#f3e1c9] bg-white/75 px-2.5 py-1.5">
                                                                <p className="text-xs font-black text-[#935d11]">{item.segment} → {item.correction}</p>
                                                                <p className="mt-0.5 text-xs font-medium text-[#6b5940]">{item.reason}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : questionFeedback ? (
                                <div className="mt-3 rounded-[1rem] border-[3px] border-[#bfead4] bg-[#f2fff8] px-4 py-3">
                                    <p className="text-sm font-black text-[#15744a]">{questionFeedback.scoreLabel}</p>
                                    <p className="mt-1 text-sm text-[#2f5d46]">{questionFeedback.feedback}</p>
                                </div>
                            ) : null}

                            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={handleSkipQuestion}
                                    disabled={isListeningAdvancePending}
                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-white px-4 py-2.5 text-sm font-black text-[#574d43]"
                                    style={getPressableStyle("rgba(23,18,13,0.08)", 4)}
                                >
                                    跳过
                                </button>
                                {currentQuestion.module === "listening" && questionFeedback && (
                                    <button
                                        type="button"
                                        onClick={moveToNextQuestion}
                                        className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#9fd8b3,#6fbd8f)] px-5 py-2.5 text-sm font-black text-[#113c23]"
                                        style={getPressableStyle("rgba(88,176,126,0.8)", 4)}
                                    >
                                        下一题
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                )}
                                {currentQuestion.module !== "listening" && (
                                    <>
                                        {questionFeedback ? (
                                            <button
                                                type="button"
                                                onClick={moveToNextQuestion}
                                                className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#9fd8b3,#6fbd8f)] px-5 py-2.5 text-sm font-black text-[#113c23]"
                                                style={getPressableStyle("rgba(88,176,126,0.8)", 4)}
                                            >
                                                下一题
                                                <ArrowRight className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAnswerDraft("");
                                                        setRunnerError(null);
                                                    }}
                                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#fff6ea] px-4 py-2.5 text-sm font-black text-[#9d6b33]"
                                                    style={getPressableStyle("rgba(238,186,128,0.9)", 4)}
                                                >
                                                    <Eraser className="h-4 w-4" />
                                                    清空
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSubmitQuestion}
                                                    disabled={isSubmitting}
                                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                                                    style={getPressableStyle("rgba(207,135,93,0.92)", 4)}
                                                >
                                                    <SendHorizontal className="h-4 w-4" />
                                                    {isSubmitting ? "提交中..." : "提交"}
                                                </button>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    )}

                    {stage === "complete" && (
                        <section className="px-6 pb-7 pt-8 md:px-10">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffd9a8] bg-[#fff4df] px-3 py-1 text-xs font-black text-[#b26b16]">
                                <Sparkles className="h-3.5 w-3.5" />
                                PRE-TEST COMPLETE
                            </div>
                            <h3 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#5a3f30]">前测完成，准备开答！</h3>
                            <p className="mt-3 text-sm leading-7 text-[#6f6458] md:text-base">
                                你已完成听/写/译测试，结果仅用于热身，不影响 CAT 分。
                            </p>

                            <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
                                <StatPill label="听力" value={`${moduleStats.listening.done}/${moduleStats.listening.total}`} />
                                <StatPill label="仿写" value={`${moduleStats.writing.done}/${moduleStats.writing.total}`} />
                                <StatPill label="翻译" value={`${moduleStats.translation.done}/${moduleStats.translation.total}`} />
                                <StatPill label="跳过" value={`${skippedCount}`} />
                            </div>

                            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                                <span className="rounded-full border border-[#e4d8c6] bg-white px-3 py-1.5 text-xs font-black text-[#7b6f63]">
                                    {Math.max(0, countdown)}s 后自动进入
                                </span>
                                <button
                                    type="button"
                                    onClick={onEnterQuiz}
                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-6 py-3 text-sm font-black text-white"
                                    style={getPressableStyle("rgba(207,135,93,0.92)", 5)}
                                >
                                    进入正式答题
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </section>
                    )}
                </motion.div>
            </motion.div>
            {wordPopup ? (
                <WordPopup popup={wordPopup} onClose={() => setWordPopup(null)} />
            ) : null}
        </AnimatePresence>
    );
}

function StatPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[1rem] border-[3px] border-[#eadfce] bg-white/80 px-3 py-2.5 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9b8a78]">{label}</p>
            <p className="mt-1 text-sm font-black text-[#4d4338]">{value}</p>
        </div>
    );
}
