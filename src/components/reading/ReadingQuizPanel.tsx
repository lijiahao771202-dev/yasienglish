"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Trophy,
    ChevronRight,
    RotateCcw,
    Sparkles,
    Send,
    ChevronDown,
    BookMarked,
    Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";
import { PretextTextarea } from "@/components/ui/PretextTextarea";
import {
    getQuestionCorrectTokens,
    isObjectiveQuestionAnswered,
    isObjectiveQuestionCorrect,
    normalizeObjectiveToken,
    scoreObjectiveQuiz,
    type QuizAnswerValue,
} from "@/lib/quiz-scoring";

export interface QuizQuestion {
    id: number;
    itemId?: string;
    type: "multiple_choice" | "multiple_select" | "short_answer" | "true_false_ng" | "matching" | "fill_blank" | "fill_blank_choice";
    question: string;
    options?: string[];
    answer?: string;
    answers?: string[];
    explanation: string | {
        summary?: string;
        evidence?: string;
        reasoning?: string;
        trap?: string;
    };
    sourceParagraph?: string;
    evidence?: string;
    reasoning?: string;
    trap?: string;
    itemDifficulty?: number;
    passageIndex?: number;
}

function normalizeQuestion(raw: unknown, index: number): QuizQuestion | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Partial<QuizQuestion>;
    if (typeof candidate.question !== "string") return null;

    const questionType = candidate.type;
    const normalizedType: QuizQuestion["type"] =
        questionType === "multiple_choice"
        || questionType === "multiple_select"
        || questionType === "short_answer"
        || questionType === "true_false_ng"
        || questionType === "matching"
        || questionType === "fill_blank"
        || questionType === "fill_blank_choice"
            ? questionType
            : "multiple_choice";

    const rawOptions = Array.isArray(candidate.options)
        ? candidate.options.filter((opt): opt is string => typeof opt === "string" && opt.trim().length > 0)
        : [];
    const normalizedOptions = rawOptions.map((option, optionIndex) => {
        const trimmed = option.trim();
        const expectedLetter = String.fromCharCode(65 + optionIndex);
        return /^[A-D](?:[).:\-\s]|$)/i.test(trimmed) ? trimmed : `${expectedLetter}. ${trimmed}`;
    });

    const resolveTokenFromOptions = (token: string) => {
        const normalizedToken = normalizeObjectiveToken(token);
        if (["A", "B", "C", "D"].includes(normalizedToken)) {
            return normalizedToken;
        }
        const matchedIndex = normalizedOptions.findIndex((option) => {
            const withoutPrefix = option.replace(/^[A-D](?:[).:\-\s]+)?/i, "").trim();
            return withoutPrefix.toUpperCase() === normalizedToken || option.toUpperCase() === normalizedToken;
        });
        if (matchedIndex >= 0) {
            return String.fromCharCode(65 + matchedIndex);
        }
        return normalizedToken;
    };

    const answer = typeof candidate.answer === "string" ? candidate.answer.trim() : undefined;
    const parsedAnswers = Array.isArray(candidate.answers)
        ? candidate.answers
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim())
        : [];
    const fallbackMultiAnswers =
        normalizedType === "multiple_select" && typeof answer === "string"
            ? answer
                .split(/[，,;/|\s]+/g)
                .map((item) => item.trim())
                .filter(Boolean)
            : [];
    const normalizedAnswers = normalizedType === "multiple_select"
        ? Array.from(new Set([...parsedAnswers, ...fallbackMultiAnswers].map((token) => resolveTokenFromOptions(token))))
        : [];
    const explanation = typeof candidate.explanation === "string" ? candidate.explanation : "";
    const explanationObj =
        candidate.explanation && typeof candidate.explanation === "object"
            ? candidate.explanation as Partial<{
                summary: string;
                evidence: string;
                reasoning: string;
                trap: string;
            }>
            : null;

    const requiresSingleAnswer = normalizedType !== "multiple_select";
    if (normalizedType === "multiple_select" && normalizedAnswers.length < 2) {
        return null;
    }

    // For option-based single-answer questions, missing answer means this item is unusable.
    if (rawOptions.length > 0 && requiresSingleAnswer && !answer) {
        return null;
    }

    return {
        id: typeof candidate.id === "number" ? candidate.id : index + 1,
        itemId: typeof candidate.itemId === "string" ? candidate.itemId : undefined,
        type: normalizedType,
        question: candidate.question.trim(),
        options: normalizedOptions.length > 0 ? normalizedOptions : undefined,
        answer: typeof answer === "string" ? resolveTokenFromOptions(answer) : undefined,
        answers: normalizedType === "multiple_select" ? normalizedAnswers : undefined,
        explanation: explanationObj ?? explanation,
        sourceParagraph: typeof candidate.sourceParagraph === "string" ? candidate.sourceParagraph : undefined,
        evidence: typeof candidate.evidence === "string" ? candidate.evidence : explanationObj?.evidence,
        reasoning: typeof candidate.reasoning === "string" ? candidate.reasoning : explanationObj?.reasoning,
        trap: typeof candidate.trap === "string" ? candidate.trap : explanationObj?.trap,
        itemDifficulty: typeof candidate.itemDifficulty === "number"
            ? candidate.itemDifficulty
            : (typeof (candidate as { b?: number }).b === "number" ? (candidate as { b: number }).b : undefined),
        passageIndex: typeof candidate.passageIndex === "number" ? candidate.passageIndex : undefined,
    };
}

export interface QuizSubmitPayload {
    correct: number;
    total: number;
    responses?: Array<{
        itemId: string;
        order: number;
        answer?: string | string[];
        correct: boolean;
        latencyMs: number;
        itemDifficulty: number;
        itemType?: string;
    }>;
    qualityTier?: "ok" | "low_confidence";
}

interface CatQuestionResponse {
    itemId: string;
    order: number;
    answer?: string | string[];
    correct: boolean;
    latencyMs: number;
    itemDifficulty: number;
    itemType?: string;
}

interface ReadingQuizPanelProps {
    articleContent: string;
    articleTitle: string;
    difficulty: "cet4" | "cet6" | "ielts";
    quizMode?: "standard" | "cat";
    catBand?: number;
    catScore?: number;
    catTheta?: number;
    catSe?: number;
    catTargetSe?: number;
    catMinItems?: number;
    catMaxItems?: number;
    catQuizBlueprint?: {
        questionCount?: number;
        distribution?: Record<string, number>;
        allowedTypes?: string[];
    };
    floatingCompact?: boolean;
    onFloatingCompactChange?: (compact: boolean) => void;
    onClose: () => void;
    onLocate?: (payload: { questionNumber: number; sourceParagraph: string; evidence?: string }) => void;
    cachedQuestions?: QuizQuestion[];
    onQuestionsReady?: (questions: QuizQuestion[]) => void;
    onSubmitScore?: (score: QuizSubmitPayload) => void;
}

const DIFFICULTY_META: Record<string, { label: string; color: string; bgClass: string }> = {
    cet4: { label: "四级", color: "text-emerald-700", bgClass: "bg-emerald-100/70 border-emerald-200" },
    cet6: { label: "六级", color: "text-blue-700", bgClass: "bg-blue-100/70 border-blue-200" },
    ielts: { label: "雅思", color: "text-violet-700", bgClass: "bg-violet-100/70 border-violet-200" },
};

export function ReadingQuizPanel({
    articleContent,
    articleTitle,
    difficulty,
    quizMode = "standard",
    catBand,
    catScore,
    catTheta,
    catSe,
    catTargetSe = 0.56,
    catMinItems = 2,
    catMaxItems = 8,
    catQuizBlueprint,
    floatingCompact = false,
    onFloatingCompactChange,
    onClose,
    onLocate,
    cachedQuestions,
    onQuestionsReady,
    onSubmitScore,
}: ReadingQuizPanelProps) {
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // User answers: key = question id, value = selected answer
    const [answers, setAnswers] = useState<Record<number, QuizAnswerValue>>({});
    const [questionFirstAnswerAt, setQuestionFirstAnswerAt] = useState<Record<number, number>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
    const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});
    const [catStepIndex, setCatStepIndex] = useState(0);
    const [catResponseMap, setCatResponseMap] = useState<Record<number, CatQuestionResponse>>({});
    const [isCatCompactMode, setIsCatCompactMode] = useState(true);
    const autoCompactTimerRef = useRef<number | null>(null);
    const catAutoFinalizeTimerRef = useRef<number | null>(null);

    const diffMeta = DIFFICULTY_META[difficulty] || DIFFICULTY_META.ielts;

    const clearAutoCompactTimer = useCallback(() => {
        if (autoCompactTimerRef.current) {
            window.clearTimeout(autoCompactTimerRef.current);
            autoCompactTimerRef.current = null;
        }
    }, []);

    const clearAutoFinalizeTimer = useCallback(() => {
        if (catAutoFinalizeTimerRef.current) {
            window.clearTimeout(catAutoFinalizeTimerRef.current);
            catAutoFinalizeTimerRef.current = null;
        }
    }, []);

    const scheduleAutoCompact = useCallback((delay = 1200) => {
        if (!(quizMode === "cat" && floatingCompact)) return;
        clearAutoCompactTimer();
        autoCompactTimerRef.current = window.setTimeout(() => {
            setIsCatCompactMode(true);
        }, delay);
    }, [clearAutoCompactTimer, floatingCompact, quizMode]);

    useEffect(() => () => {
        clearAutoCompactTimer();
        clearAutoFinalizeTimer();
    }, [clearAutoCompactTimer, clearAutoFinalizeTimer]);

    useEffect(() => {
        if (quizMode !== "cat" || !floatingCompact) return;
        onFloatingCompactChange?.(isCatCompactMode);
    }, [floatingCompact, isCatCompactMode, onFloatingCompactChange, quizMode]);
    // Fetch quiz questions on mount
    useEffect(() => {
        if (cachedQuestions && cachedQuestions.length > 0) {
            setQuestions(cachedQuestions);
            setIsLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        const fetchQuiz = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/ai/generate-quiz", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        articleContent,
                        difficulty,
                        title: articleTitle,
                        quizMode,
                        catBand,
                        catScore,
                        catQuizBlueprint,
                    }),
                });
                const data = await res.json();
                if (!cancelled) {
                    const normalizedQuestions = Array.isArray(data.questions)
                        ? data.questions
                            .map((item: unknown, idx: number) => normalizeQuestion(item, idx))
                            .filter((item: QuizQuestion | null): item is QuizQuestion => item !== null)
                        : [];

                    if (normalizedQuestions.length > 0) {
                        setQuestions(normalizedQuestions);
                        setAnswers({});
                        setQuestionFirstAnswerAt({});
                        setExpandedExplanations({});
                        setCatStepIndex(0);
                        setCatResponseMap({});
                        setIsSubmitted(false);
                        setScore(null);
                        if (quizMode === "cat" && floatingCompact) {
                            setIsCatCompactMode(true);
                        }
                        onQuestionsReady?.(normalizedQuestions);
                    } else {
                        setError("未能生成题目，请重试。");
                    }
                }
            } catch {
                if (!cancelled) setError("题目生成失败，请检查网络。");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        fetchQuiz();
        return () => { cancelled = true; };
    }, [articleContent, difficulty, articleTitle, cachedQuestions, onQuestionsReady, quizMode, catBand, catScore, catQuizBlueprint, floatingCompact]);

    const handleSelectAnswer = (question: QuizQuestion, option: string) => {
        if (isSubmitted) return;
        if (quizMode === "cat" && catResponseMap[question.id]) return;
        if (quizMode === "cat" && floatingCompact) {
            setIsCatCompactMode(false);
        }
        const now = Date.now();
        setQuestionFirstAnswerAt((prev) => (prev[question.id] ? prev : { ...prev, [question.id]: now }));
        if (question.type === "multiple_select") {
            setAnswers((prev) => {
                const current = Array.isArray(prev[question.id]) ? prev[question.id] as string[] : [];
                const next = current.includes(option)
                    ? current.filter((item) => item !== option)
                    : [...current, option];
                return { ...prev, [question.id]: next };
            });
            return;
        }
        setAnswers((prev) => ({ ...prev, [question.id]: option }));
    };

    const handleTextAnswer = (questionId: number, text: string) => {
        if (isSubmitted) return;
        if (quizMode === "cat" && catResponseMap[questionId]) return;
        if (quizMode === "cat" && floatingCompact) {
            setIsCatCompactMode(false);
        }
        const now = Date.now();
        setQuestionFirstAnswerAt((prev) => (prev[questionId] ? prev : { ...prev, [questionId]: now }));
        setAnswers((prev) => ({ ...prev, [questionId]: text }));
    };

    const getFallbackDifficulty = (question: QuizQuestion, order: number, poolLength: number) => {
        const fallbackDifficulty = (typeof catTheta === "number" ? catTheta : (typeof catScore === "number" ? (catScore / 3200) * 6 - 3 : 0))
            + ((order - 1) / Math.max(1, poolLength - 1)) * 0.9
            - 0.35;
        return typeof question.itemDifficulty === "number" ? question.itemDifficulty : Number(fallbackDifficulty.toFixed(3));
    };

    const buildCatResponse = (question: QuizQuestion, order: number, submittedAt: number): CatQuestionResponse => {
        const answerValue = answers[question.id];
        const answer = Array.isArray(answerValue)
            ? answerValue.map((token) => String(token))
            : typeof answerValue === "string"
                ? answerValue
                : undefined;
        const firstAnsweredAt = questionFirstAnswerAt[question.id] ?? submittedAt;
        const latencyMs = Math.max(200, submittedAt - firstAnsweredAt);
        return {
            itemId: question.itemId || `cat-item-${order}`,
            order,
            answer,
            correct: isObjectiveQuestionCorrect(question, answers[question.id]),
            latencyMs,
            itemDifficulty: getFallbackDifficulty(question, order, Math.max(questions.length, 1)),
            itemType: question.type,
        };
    };

    const handleSubmit = () => {
        const submittedAt = Date.now();
        const answeredQuestions = questions.filter((question) => isObjectiveQuestionAnswered(question, answers[question.id]));
        const scoringPool = quizMode === "cat" ? answeredQuestions : questions;
        const finalScore = scoreObjectiveQuiz(scoringPool, answers);
        const normalizedResponses = scoringPool.map((question, index) => buildCatResponse(question, index + 1, submittedAt));
        setScore(finalScore);
        setIsSubmitted(true);
        onSubmitScore?.({
            ...finalScore,
            responses: quizMode === "cat" ? normalizedResponses : undefined,
            qualityTier: quizMode === "cat" && typeof catSe === "number" && catSe > 1.25 ? "low_confidence" : "ok",
        });
    };

    const handleReset = () => {
        clearAutoCompactTimer();
        clearAutoFinalizeTimer();
        setAnswers({});
        setQuestionFirstAnswerAt({});
        setIsSubmitted(false);
        setScore(null);
        setExpandedExplanations({});
        setCatStepIndex(0);
        setCatResponseMap({});
        setIsCatCompactMode(true);
    };

    const isCorrect = (q: QuizQuestion): boolean => isObjectiveQuestionCorrect(q, answers[q.id]);

    const answeredCount = questions.filter((q) => isObjectiveQuestionAnswered(q, answers[q.id])).length;
    const catSubmittedCount = Object.keys(catResponseMap).length;
    const catCurrentQuestion = questions[catStepIndex];
    const catCurrentCommitted = Boolean(catCurrentQuestion && catResponseMap[catCurrentQuestion.id]);
    const catCurrentCanSubmit = Boolean(catCurrentQuestion && isObjectiveQuestionAnswered(catCurrentQuestion, answers[catCurrentQuestion.id]));
    const catMinRequired = Math.min(catMinItems, Math.max(1, questions.length));
    const catMaxAllowed = Math.min(catMaxItems, Math.max(1, questions.length));
    const hasReachedCatMin = catSubmittedCount >= catMinRequired;
    const hasReachedCatMax = catSubmittedCount >= catMaxAllowed;
    const nextUnsubmittedIndex = questions.findIndex((question, index) => index > catStepIndex && !catResponseMap[question.id]);
    const hasNextQuestion = nextUnsubmittedIndex >= 0;

    const handleSubmitCurrentCatQuestion = () => {
        if (!catCurrentQuestion || catCurrentCommitted || !catCurrentCanSubmit) return;
        const submittedAt = Date.now();
        const response = buildCatResponse(catCurrentQuestion, catSubmittedCount + 1, submittedAt);
        setCatResponseMap((prev) => ({ ...prev, [catCurrentQuestion.id]: response }));
        setExpandedExplanations((prev) => ({ ...prev, [catCurrentQuestion.id]: true }));
        scheduleAutoCompact();
    };

    const handleNextCatQuestion = () => {
        if (nextUnsubmittedIndex < 0) return;
        clearAutoCompactTimer();
        setCatStepIndex(nextUnsubmittedIndex);
        if (quizMode === "cat" && floatingCompact) {
            setIsCatCompactMode(false);
        }
    };

    const handleFinalizeCatSession = useCallback(() => {
        if (!hasReachedCatMin) return;
        clearAutoFinalizeTimer();
        const responses = Object.values(catResponseMap).sort((left, right) => left.order - right.order);
        const correct = responses.filter((item) => item.correct).length;
        const total = responses.length;
        const finalScore = { correct, total };
        setScore(finalScore);
        setIsSubmitted(true);
        clearAutoCompactTimer();
        if (quizMode === "cat" && floatingCompact) {
            setIsCatCompactMode(false);
        }
        onSubmitScore?.({
            ...finalScore,
            responses,
            qualityTier: quizMode === "cat" && typeof catSe === "number" && catSe > 1.25 ? "low_confidence" : "ok",
        });
    }, [
        catResponseMap,
        catSe,
        clearAutoCompactTimer,
        clearAutoFinalizeTimer,
        floatingCompact,
        hasReachedCatMin,
        onSubmitScore,
        quizMode,
        setIsCatCompactMode,
        setIsSubmitted,
        setScore,
    ]);

    const allAnswered = questions.length > 0 && answeredCount === questions.length;
    const canSubmitCat = quizMode === "cat"
        ? hasReachedCatMin
        : false;
    const canSubmit = quizMode === "cat" ? canSubmitCat : allAnswered;
    const catAnsweredHint = quizMode === "cat"
        ? `已提交 ${catSubmittedCount} 题 · 至少 ${catMinRequired} 题，精度达标自动收卷（上限 ${catMaxAllowed} 题，目标SE ≤ ${catTargetSe.toFixed(2)}）`
        : null;
    const isFloatingCat = quizMode === "cat" && floatingCompact;
    const toggleExplanation = (questionId: number) => {
        setExpandedExplanations((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
    };

    useEffect(() => {
        if (quizMode !== "cat" || isSubmitted) {
            clearAutoFinalizeTimer();
            return;
        }

        const shouldAutoFinalize = hasReachedCatMin && (hasReachedCatMax || (!hasNextQuestion && catCurrentCommitted));
        if (!shouldAutoFinalize) {
            clearAutoFinalizeTimer();
            return;
        }

        if (catAutoFinalizeTimerRef.current) return;

        catAutoFinalizeTimerRef.current = window.setTimeout(() => {
            catAutoFinalizeTimerRef.current = null;
            handleFinalizeCatSession();
        }, 160);

        return () => {
            clearAutoFinalizeTimer();
        };
    }, [
        catCurrentCommitted,
        clearAutoFinalizeTimer,
        handleFinalizeCatSession,
        hasNextQuestion,
        hasReachedCatMax,
        hasReachedCatMin,
        isSubmitted,
        quizMode,
    ]);

    const shouldUseCompactShell = quizMode === "cat" && floatingCompact && isCatCompactMode && !isSubmitted;
    if (shouldUseCompactShell) {
        return (
            <div className="flex h-full items-center justify-between gap-3 px-4">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                        阅读测验 · 第 {Math.min(catSubmittedCount + 1, Math.max(1, questions.length || 1))} 题
                    </p>
                    <p className="mt-0.5 truncate text-xs text-violet-700/90">
                        {catSubmittedCount}/{catMaxAllowed} · 至少 {catMinRequired} 题后按精度自动收卷
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {hasReachedCatMin ? (
                        <button
                            onClick={handleFinalizeCatSession}
                            className="rounded-lg border border-violet-200/80 bg-violet-100/80 px-3 py-1.5 text-xs font-bold text-violet-800 transition-colors hover:bg-violet-100"
                        >
                            结算
                        </button>
                    ) : null}
                    <button
                        onClick={() => {
                            clearAutoCompactTimer();
                            setIsCatCompactMode(false);
                        }}
                        className="rounded-lg border border-white/75 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-[0_10px_20px_-14px_rgba(15,23,42,0.8)] transition-colors hover:bg-white"
                    >
                        展开作答
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-white/40 px-4 py-2.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {!isFloatingCat && <Sparkles className="h-5 w-5 text-pink-500" />}
                        <h3 className={cn("font-newsreader font-bold text-slate-900", isFloatingCat ? "text-base" : "text-lg")}>
                            {isFloatingCat ? "阅读测验" : "阅读理解"}
                        </h3>
                        {isFloatingCat && (
                            <span className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {Math.min(catSubmittedCount + (catCurrentCommitted ? 0 : 1), catMaxAllowed)}/{catMaxAllowed}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isFloatingCat && (
                            <span
                                className={cn(
                                    "rounded-full border px-2.5 py-0.5 text-xs font-bold",
                                    diffMeta.bgClass,
                                    diffMeta.color
                                )}
                            >
                                {diffMeta.label}
                            </span>
                        )}
                        {isFloatingCat && !isSubmitted ? (
                            <button
                                onClick={() => {
                                    clearAutoCompactTimer();
                                    setIsCatCompactMode(true);
                                }}
                                className="rounded-full border border-white/70 bg-white/75 p-1.5 text-slate-600 transition-colors hover:bg-white"
                                aria-label="收起答题面板"
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </div>
                </div>
                {score && !isFloatingCat && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/50 px-4 py-3"
                    >
                        <Trophy className="h-6 w-6 text-amber-500" />
                        <div>
                            <div className="text-2xl font-black text-slate-900">
                                {score.correct}
                                <span className="text-base font-medium text-slate-400">
                                    /{score.total}
                                </span>
                            </div>
                            <div className="text-xs text-slate-500">
                                正确率 {Math.round((score.correct / score.total) * 100)}%
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Questions Body */}
            <div className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-y-contain px-4 py-2.5 scrollbar-hide">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <Loader2 className="mb-4 h-8 w-8 animate-spin text-pink-400" />
                        <p className="text-sm font-medium">正在生成题目...</p>
                        <p className="mt-1 text-xs text-slate-400">
                            AI 正在分析文章并出题
                        </p>
                    </div>
                )}
                {!isLoading && quizMode === "cat" && !isFloatingCat && (
                    <div className="rounded-xl border border-violet-200/70 bg-violet-50/65 px-3 py-2 text-xs font-medium text-violet-700">
                        {catAnsweredHint}
                    </div>
                )}
                {!isLoading && quizMode === "cat" && isFloatingCat && (
                    <div className="rounded-xl border border-violet-200/60 bg-violet-50/55 px-3 py-1.5 text-[11px] font-semibold text-violet-700">
                        已提交 {catSubmittedCount} 题，至少 {catMinRequired} 题后按精度自动收卷
                    </div>
                )}

                {error && (
                    <LiquidGlassPanel className="rounded-xl px-4 py-3 text-center text-sm text-red-600">
                        {error}
                    </LiquidGlassPanel>
                )}

                {quizMode === "cat" ? (
                    <AnimatePresence mode="wait">
                        {catCurrentQuestion ? (
                            <motion.div
                                key={catCurrentQuestion.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.24 }}
                            >
                                <QuestionCard
                                    question={catCurrentQuestion}
                                    index={catStepIndex}
                                    userAnswer={answers[catCurrentQuestion.id]}
                                    onSelect={handleSelectAnswer}
                                    onTextInput={handleTextAnswer}
                                    isSubmitted={Boolean(catResponseMap[catCurrentQuestion.id])}
                                    isCorrect={catResponseMap[catCurrentQuestion.id]?.correct}
                                    isExpanded={Boolean(expandedExplanations[catCurrentQuestion.id])}
                                    onToggleExpand={toggleExplanation}
                                    onLocate={onLocate}
                                    compact={isFloatingCat}
                                />
                            </motion.div>
                        ) : (
                            <div className="rounded-xl border border-white/60 bg-white/45 px-4 py-3 text-sm text-slate-600">
                                本局题目已完成，可直接结算。
                            </div>
                        )}
                    </AnimatePresence>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {questions.map((q, idx) => (
                            <motion.div
                                key={q.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.06 }}
                            >
                                <QuestionCard
                                    question={q}
                                    index={idx}
                                    userAnswer={answers[q.id]}
                                    onSelect={handleSelectAnswer}
                                    onTextInput={handleTextAnswer}
                                    isSubmitted={isSubmitted}
                                    isCorrect={isSubmitted ? isCorrect(q) : undefined}
                                    isExpanded={Boolean(expandedExplanations[q.id])}
                                    onToggleExpand={toggleExplanation}
                                    onLocate={onLocate}
                                    compact={false}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Footer Actions */}
            {questions.length > 0 && (
                <div className="flex-shrink-0 border-t border-white/40 px-4 py-2.5">
                    {!isSubmitted && quizMode === "cat" ? (
                        <div className={cn("flex flex-wrap gap-2.5", isFloatingCat && "gap-2")}>
                            {!catCurrentCommitted ? (
                                <button
                                    onClick={handleSubmitCurrentCatQuestion}
                                    disabled={!catCurrentCanSubmit}
                                    className={cn(
                                        "flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300",
                                        isFloatingCat ? "min-w-[128px] flex-1 py-2.5" : "min-w-[180px] flex-1 py-3",
                                        catCurrentCanSubmit
                                            ? "border border-white/60 bg-white/70 text-slate-800 shadow-[0_14px_30px_-20px_rgba(15,23,42,0.7)] hover:bg-white/90"
                                            : "border border-white/40 bg-white/30 text-slate-400 cursor-not-allowed"
                                    )}
                                >
                                    <Send className="h-4 w-4" />
                                    {isFloatingCat ? "提交" : "提交本题"}
                                </button>
                            ) : (
                                <button
                                    onClick={handleNextCatQuestion}
                                    disabled={!hasNextQuestion || hasReachedCatMax}
                                    className={cn(
                                        "flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300",
                                        isFloatingCat ? "min-w-[128px] flex-1 py-2.5" : "min-w-[180px] flex-1 py-3",
                                        hasNextQuestion && !hasReachedCatMax
                                            ? "border border-white/60 bg-white/70 text-slate-800 shadow-[0_14px_30px_-20px_rgba(15,23,42,0.7)] hover:bg-white/90"
                                            : "border border-white/40 bg-white/30 text-slate-400 cursor-not-allowed"
                                    )}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                    下一题
                                </button>
                            )}
                            <button
                                onClick={handleFinalizeCatSession}
                                disabled={!canSubmitCat}
                                className={cn(
                                    "flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300",
                                    isFloatingCat ? "min-w-[128px] py-2.5 px-4" : "min-w-[180px] flex-1 py-3",
                                    canSubmitCat
                                        ? "border border-violet-200/70 bg-violet-100/70 text-violet-800 shadow-[0_14px_30px_-20px_rgba(109,40,217,0.55)] hover:bg-violet-100"
                                        : "border border-white/40 bg-white/30 text-slate-400 cursor-not-allowed"
                                )}
                            >
                                {isFloatingCat ? "结算" : "完成本局结算"}
                            </button>
                        </div>
                    ) : !isSubmitted ? (
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className={cn(
                                "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all duration-300",
                                canSubmit
                                    ? "border border-white/60 bg-white/70 text-slate-800 shadow-[0_14px_30px_-20px_rgba(15,23,42,0.7)] hover:bg-white/90"
                                    : "border border-white/40 bg-white/30 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            <Send className="h-4 w-4" />
                            提交答案
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            {quizMode !== "cat" ? (
                                <button
                                    onClick={handleReset}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/50 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-white/70"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    重做
                                </button>
                            ) : null}
                            <button
                                onClick={onClose}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/70 py-3 text-sm font-bold text-slate-800 shadow-[0_14px_30px_-20px_rgba(15,23,42,0.7)] transition-all hover:bg-white/90"
                            >
                                <ChevronRight className="h-4 w-4" />
                                完成
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Question Card ────────────────────────────────────────────

function QuestionCard({
    question,
    index,
    userAnswer,
    onSelect,
    onTextInput,
    isSubmitted,
    isCorrect,
    isExpanded,
    onToggleExpand,
    onLocate,
    compact = false,
}: {
    question: QuizQuestion;
    index: number;
    userAnswer: QuizAnswerValue | undefined;
    onSelect: (question: QuizQuestion, answer: string) => void;
    onTextInput: (id: number, text: string) => void;
    isSubmitted: boolean;
    isCorrect?: boolean;
    isExpanded: boolean;
    onToggleExpand: (id: number) => void;
    onLocate?: (payload: { questionNumber: number; sourceParagraph: string; evidence?: string }) => void;
    compact?: boolean;
}) {
    const typeLabels: Record<string, string> = {
        multiple_choice: "选择",
        multiple_select: "多选",
        short_answer: "简答",
        true_false_ng: "判断",
        matching: "匹配",
        fill_blank: "填空",
        fill_blank_choice: "填空",
    };
    const isMultipleSelect = question.type === "multiple_select";
    const userSelectedValues = Array.isArray(userAnswer)
        ? userAnswer
        : typeof userAnswer === "string" && userAnswer.trim().length > 0
            ? [userAnswer]
            : [];
    const correctTokens = getQuestionCorrectTokens(question);
    const correctTokenSet = new Set(correctTokens);
    const correctAnswerText = correctTokens.length > 0
        ? correctTokens.join("、")
        : (typeof question.answer === "string" ? question.answer : "-");

    const explanationData = (() => {
        if (typeof question.explanation === "string") {
            return {
                summary: question.explanation,
                evidence: question.evidence || "",
                reasoning: question.reasoning || "",
                trap: question.trap || "",
            };
        }
        return {
            summary: question.explanation?.summary || "",
            evidence: question.evidence || question.explanation?.evidence || "",
            reasoning: question.reasoning || question.explanation?.reasoning || "",
            trap: question.trap || question.explanation?.trap || "",
        };
    })();

    return (
        <LiquidGlassPanel
            className={cn(
                compact ? "rounded-[18px] p-3.5 transition-all duration-300" : "rounded-2xl p-4 transition-all duration-300",
                isSubmitted && isCorrect && "ring-1 ring-emerald-300/60",
                isSubmitted && !isCorrect && "ring-1 ring-rose-300/60"
            )}
        >
            {/* Question Header */}
            <div className={cn("flex items-start gap-2", compact ? "mb-2.5" : "mb-3")}>
                <span className={cn(
                    "flex flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white",
                    compact ? "h-5 w-5" : "h-6 w-6"
                )}>
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                        {!compact && (
                            <span className="rounded-md bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                {typeLabels[question.type] || question.type}
                            </span>
                        )}
                        {!compact && isMultipleSelect && (
                            <span className="rounded-md border border-cyan-200/80 bg-cyan-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                                可多选
                            </span>
                        )}
                        {isSubmitted && (
                            isCorrect ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <XCircle className="h-4 w-4 text-rose-500" />
                            )
                        )}
                    </div>
                    <p className={cn("font-medium leading-relaxed text-slate-800", compact ? "text-[15px]" : "text-sm")}>
                        {question.question}
                    </p>
                </div>
            </div>

            {/* Answer Area */}
            {question.options && question.options.length > 0 ? (
                <div className={cn("space-y-2", compact ? "pl-7" : "pl-8")}>
                    {question.options.map((option) => {
                        const optionToken = normalizeObjectiveToken(option);
                        const isSelected = userSelectedValues.includes(option);
                        const isCorrectOption = isSubmitted && correctTokenSet.has(optionToken);
                        return (
                            <button
                                key={option}
                                onClick={() => onSelect(question, option)}
                                disabled={isSubmitted}
                                className={cn(
                                    "w-full rounded-xl border text-left transition-all duration-200",
                                    compact ? "px-3 py-2 text-[15px]" : "px-3 py-2.5 text-sm",
                                    !isSubmitted && isSelected && "border-cyan-300 bg-cyan-50/80 text-slate-900 shadow-sm",
                                    !isSubmitted && !isSelected && "border-white/60 bg-white/40 text-slate-600 hover:bg-white/60",
                                    isSubmitted && isCorrectOption && "border-emerald-300 bg-emerald-50/80 text-emerald-800",
                                    isSubmitted && isSelected && !isCorrectOption && "border-rose-300 bg-rose-50/80 text-rose-700",
                                    isSubmitted && !isSelected && !isCorrectOption && "border-white/40 bg-white/25 text-slate-400"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    {isMultipleSelect ? (
                                        <span className={cn(
                                            "inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                                            isSelected
                                                ? "border-cyan-400 bg-cyan-100 text-cyan-700"
                                                : "border-slate-300/80 bg-white/65 text-slate-400"
                                        )}>
                                            {isSelected ? "✓" : ""}
                                        </span>
                                    ) : null}
                                    <span>{option}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                /* Text input for short_answer / fill_blank */
                <div className={cn(compact ? "pl-7" : "pl-8")}>
                    <PretextTextarea
                        value={typeof userAnswer === "string" ? userAnswer : ""}
                        onChange={(e) => onTextInput(question.id, e.target.value)}
                        disabled={isSubmitted}
                        placeholder="Type your answer here..."
                        className="w-full rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-colors focus:border-cyan-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        rows={compact ? 1 : 2}
                        minRows={compact ? 1 : 2}
                        maxRows={8}
                    />
                </div>
            )}

            {/* Explanation (after submit) */}
            {isSubmitted && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.3 }}
                    className={cn("overflow-hidden", compact ? "mt-2.5 ml-7" : "mt-3 ml-8")}
                >
                    <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-3 py-2.5">
                        <p className="mb-1 text-xs font-semibold text-amber-700">
                            {isCorrect ? "✓ 正确" : `✗ 正确答案：${correctAnswerText}`}
                        </p>
                        <p className="text-xs leading-relaxed text-amber-800/90">
                            {explanationData.summary || "该题可根据原文关键信息定位作答。"}
                        </p>

                        {!compact && (question.sourceParagraph || explanationData.evidence) && (
                            <div className="mt-2 rounded-lg border border-amber-200/70 bg-white/55 px-2.5 py-2">
                                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                                    <BookMarked className="h-3.5 w-3.5" />
                                    <span>定位依据</span>
                                    {question.sourceParagraph && (
                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px]">
                                            段落 {question.sourceParagraph}
                                        </span>
                                    )}
                                </div>
                                {explanationData.evidence && (
                                    <p className="text-[11px] leading-relaxed text-amber-900/85">
                                        {explanationData.evidence}
                                    </p>
                                )}
                                {question.sourceParagraph && onLocate && (
                                    <button
                                        onClick={() => onLocate({
                                            questionNumber: index + 1,
                                            sourceParagraph: question.sourceParagraph as string,
                                            evidence: explanationData.evidence,
                                        })}
                                        className="mt-2 inline-flex items-center rounded-md border border-amber-200 bg-white/80 px-2 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-white"
                                    >
                                        定位到原文（第{index + 1}题）
                                    </button>
                                )}
                            </div>
                        )}

                        {!compact && (explanationData.reasoning || explanationData.trap) && (
                            <div className="mt-2">
                                <button
                                    onClick={() => onToggleExpand(question.id)}
                                    className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 transition-colors hover:text-amber-800"
                                >
                                    <ChevronDown
                                        className={cn(
                                            "h-3.5 w-3.5 transition-transform duration-200",
                                            isExpanded && "rotate-180"
                                        )}
                                    />
                                    {isExpanded ? "收起详解" : "查看详解"}
                                </button>

                                <AnimatePresence initial={false}>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.22 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="mt-2 space-y-2 rounded-lg border border-amber-200/70 bg-white/55 px-2.5 py-2">
                                                {explanationData.reasoning && (
                                                    <div>
                                                        <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                                                            <Lightbulb className="h-3.5 w-3.5" />
                                                            解题思路
                                                        </p>
                                                        <p className="text-[11px] leading-relaxed text-amber-900/85">
                                                            {explanationData.reasoning}
                                                        </p>
                                                    </div>
                                                )}
                                                {explanationData.trap && (
                                                    <div>
                                                        <p className="mb-0.5 text-[11px] font-semibold text-amber-700">
                                                            易错点
                                                        </p>
                                                        <p className="text-[11px] leading-relaxed text-amber-900/85">
                                                            {explanationData.trap}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </LiquidGlassPanel>
    );
}
