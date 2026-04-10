"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    X,
    XCircle,
    Loader2,
    Trophy,
    ChevronRight,
    ChevronLeft,
    RotateCcw,
    Sparkles,
    Send,
    ChevronDown,
    BookMarked,
    Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

function isSameQuestionSet(prev: QuizQuestion[], next: QuizQuestion[]) {
    if (prev.length !== next.length) return false;
    return prev.every((question, index) => {
        const candidate = next[index];
        return (
            question.id === candidate.id
            && question.itemId === candidate.itemId
            && question.type === candidate.type
            && question.question === candidate.question
        );
    });
}

export interface QuizSubmitPayload {
    correct: number;
    total: number;
    answers?: Record<number, QuizAnswerValue>;
    questions?: QuizQuestion[];
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
    onClearLocate?: () => void;
    activeLocateQuestionNumber?: number | null;
    cachedQuestions?: QuizQuestion[];
    initialAnswers?: Record<number, QuizAnswerValue>;
    initialResponses?: Array<{
        itemId: string;
        order: number;
        answer?: string | string[];
        correct: boolean;
        latencyMs: number;
        itemDifficulty: number;
        itemType?: string;
    }>;
    initialSubmitted?: boolean;
    initialScore?: { correct: number; total: number } | null;
    lockAfterCompletion?: boolean;
    onQuestionsReady?: (questions: QuizQuestion[]) => void;
    onSubmitScore?: (score: QuizSubmitPayload) => void;
    titleNode?: React.ReactNode;
    dragHandleNode?: React.ReactNode;
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
    onClearLocate,
    activeLocateQuestionNumber,
    cachedQuestions,
    initialAnswers,
    initialResponses,
    initialSubmitted = false,
    initialScore = null,
    lockAfterCompletion = false,
    onQuestionsReady,
    onSubmitScore,
    titleNode,
    dragHandleNode,
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
    const [standardGradedMap, setStandardGradedMap] = useState<Record<number, boolean>>({});
    const [catStepIndex, setCatStepIndex] = useState(0);
    const [standardStepIndex, setStandardStepIndex] = useState(0);
    const [catResponseMap, setCatResponseMap] = useState<Record<number, CatQuestionResponse>>({});
    const [isCatCompactMode, setIsCatCompactMode] = useState(true);
    const autoCompactTimerRef = useRef<number | null>(null);
    const catAutoFinalizeTimerRef = useRef<number | null>(null);

    const diffMeta = DIFFICULTY_META[difficulty] || DIFFICULTY_META.ielts;

    const hydrateCompletedState = useCallback((nextQuestions: QuizQuestion[]) => {
        if (!initialSubmitted) return;

        setAnswers(initialAnswers ?? {});
        setIsSubmitted(true);
        setScore(initialScore);
        setExpandedExplanations(Object.fromEntries(nextQuestions.map((question) => [question.id, true])));
        setStandardGradedMap(
            quizMode === "standard"
                ? Object.fromEntries(nextQuestions.map((question) => [question.id, true]))
                : {},
        );

        if (quizMode === "cat" && Array.isArray(initialResponses) && initialResponses.length > 0) {
            const questionByItemId = new Map(
                nextQuestions
                    .filter((question) => typeof question.itemId === "string" && question.itemId.trim().length > 0)
                    .map((question) => [question.itemId as string, question]),
            );

            setCatResponseMap(initialResponses.reduce<Record<number, CatQuestionResponse>>((accumulator, response, index) => {
                const question = questionByItemId.get(response.itemId);
                const questionId = question?.id ?? index + 1;
                accumulator[questionId] = {
                    itemId: response.itemId,
                    order: response.order,
                    answer: response.answer,
                    correct: response.correct,
                    latencyMs: response.latencyMs,
                    itemDifficulty: response.itemDifficulty,
                    itemType: response.itemType,
                };
                return accumulator;
            }, {}));
            setCatStepIndex(0);
        }
    }, [initialAnswers, initialResponses, initialScore, initialSubmitted, quizMode]);

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
            const sameSet = isSameQuestionSet(questions, cachedQuestions);
            if (!sameSet) {
                setQuestions(cachedQuestions);
                setAnswers({});
                setQuestionFirstAnswerAt({});
                setExpandedExplanations({});
                setStandardGradedMap({});
                setCatStepIndex(0);
                setStandardStepIndex(0);
                setCatResponseMap({});
                setIsSubmitted(false);
                setScore(null);
                if (quizMode === "cat" && floatingCompact) {
                    setIsCatCompactMode(true);
                }
                hydrateCompletedState(cachedQuestions);
            }
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
                        setStandardGradedMap({});
                        setCatStepIndex(0);
                        setStandardStepIndex(0);
                        setCatResponseMap({});
                        setIsSubmitted(false);
                        setScore(null);
                        if (quizMode === "cat" && floatingCompact) {
                            setIsCatCompactMode(true);
                        }
                        hydrateCompletedState(normalizedQuestions);
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
    }, [articleContent, difficulty, articleTitle, cachedQuestions, onQuestionsReady, quizMode, catBand, catScore, catQuizBlueprint, floatingCompact, questions, hydrateCompletedState]);

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

    const handleReset = () => {
        if (lockAfterCompletion) return;
        onClearLocate?.();
        clearAutoCompactTimer();
        clearAutoFinalizeTimer();
        setAnswers({});
        setQuestionFirstAnswerAt({});
        setIsSubmitted(false);
        setScore(null);
        setExpandedExplanations({});
        setStandardGradedMap({});
        setCatStepIndex(0);
        setStandardStepIndex(0);
        setCatResponseMap({});
        setIsCatCompactMode(true);
    };

    const isCorrect = (q: QuizQuestion): boolean => isObjectiveQuestionCorrect(q, answers[q.id]);

    useEffect(() => {
        if (questions.length === 0) {
            setStandardStepIndex(0);
            return;
        }
        setStandardStepIndex((prev) => Math.min(prev, questions.length - 1));
    }, [questions.length]);

    const catReviewQuestions = isSubmitted
        ? questions.filter((question) => Boolean(catResponseMap[question.id]))
        : questions;
    const catActiveQuestions = catReviewQuestions.length > 0 ? catReviewQuestions : questions;
    const catQuestionCount = catActiveQuestions.length;
    const catSafeIndex = catQuestionCount > 0
        ? Math.min(catStepIndex, catQuestionCount - 1)
        : 0;
    const catCurrentQuestion = catActiveQuestions[catSafeIndex];
    const catAtFirst = catSafeIndex === 0;
    const catAtLast = catQuestionCount > 0 && catSafeIndex === catQuestionCount - 1;

    const catSubmittedCount = Object.keys(catResponseMap).length;
    const catCurrentCommitted = Boolean(catCurrentQuestion && catResponseMap[catCurrentQuestion.id]);
    const catCurrentCanSubmit = Boolean(catCurrentQuestion && isObjectiveQuestionAnswered(catCurrentQuestion, answers[catCurrentQuestion.id]));
    const catMinRequired = Math.min(catMinItems, Math.max(1, questions.length));
    const catMaxAllowed = Math.min(catMaxItems, Math.max(1, questions.length));
    const hasReachedCatMin = catSubmittedCount >= catMinRequired;
    const hasReachedCatMax = catSubmittedCount >= catMaxAllowed;
    const nextUnsubmittedIndex = questions.findIndex((question, index) => index > catSafeIndex && !catResponseMap[question.id]);
    const hasNextQuestion = nextUnsubmittedIndex >= 0;
    const standardQuestionCount = questions.length;
    const standardSafeIndex = standardQuestionCount > 0
        ? Math.min(standardStepIndex, standardQuestionCount - 1)
        : 0;
    const standardCurrentQuestion = questions[standardSafeIndex];
    const standardAtFirst = standardSafeIndex === 0;
    const standardAtLast = standardQuestionCount > 0 && standardSafeIndex === standardQuestionCount - 1;
    const standardCurrentAnswered = Boolean(
        standardCurrentQuestion
        && isObjectiveQuestionAnswered(standardCurrentQuestion, answers[standardCurrentQuestion.id])
    );
    const standardCurrentGraded = Boolean(
        standardCurrentQuestion
        && standardGradedMap[standardCurrentQuestion.id]
    );
    const standardGradedCount = Object.keys(standardGradedMap).length;
    const standardProgressHint = standardQuestionCount > 0
        ? `第 ${standardSafeIndex + 1} / ${standardQuestionCount} 题 · 已批改 ${standardGradedCount} 题`
        : "暂无题目";

    useEffect(() => {
        if (catQuestionCount === 0) {
            setCatStepIndex(0);
            return;
        }
        setCatStepIndex((prev) => Math.min(prev, catQuestionCount - 1));
    }, [catQuestionCount]);

    const handlePrevStandardQuestion = () => {
        onClearLocate?.();
        setStandardStepIndex((prev) => Math.max(0, prev - 1));
    };

    const handleNextStandardQuestion = () => {
        if (!standardCurrentGraded || standardAtLast) return;
        onClearLocate?.();
        setStandardStepIndex((prev) => Math.min(standardQuestionCount - 1, prev + 1));
    };

    const handleGradeStandardQuestion = () => {
        if (!standardCurrentQuestion || standardCurrentGraded || !standardCurrentAnswered) return;
        setStandardGradedMap((prev) => ({ ...prev, [standardCurrentQuestion.id]: true }));
        setExpandedExplanations((prev) => ({ ...prev, [standardCurrentQuestion.id]: true }));
    };

    const handleFinalizeStandardSession = () => {
        if (quizMode !== "standard" || isSubmitted || questions.length === 0) return;
        const allGraded = questions.every((question) => Boolean(standardGradedMap[question.id]));
        if (!allGraded) return;
        const finalScore = scoreObjectiveQuiz(questions, answers);
        setScore(finalScore);
        setIsSubmitted(true);
        onSubmitScore?.({
            ...finalScore,
            answers,
            questions,
        });
    };

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
        onClearLocate?.();
        clearAutoCompactTimer();
        setCatStepIndex(nextUnsubmittedIndex);
        if (quizMode === "cat" && floatingCompact) {
            setIsCatCompactMode(false);
        }
    };

    const handlePrevSubmittedQuestion = () => {
        onClearLocate?.();
        if (quizMode === "cat") {
            setCatStepIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        setStandardStepIndex((prev) => Math.max(0, prev - 1));
    };

    const handleNextSubmittedQuestion = () => {
        onClearLocate?.();
        if (quizMode === "cat") {
            setCatStepIndex((prev) => Math.min(Math.max(0, catQuestionCount - 1), prev + 1));
            return;
        }
        setStandardStepIndex((prev) => Math.min(Math.max(0, standardQuestionCount - 1), prev + 1));
    };

    useEffect(() => {
        if (!onClearLocate || activeLocateQuestionNumber == null) return;
        const activeQuestionNumber = quizMode === "cat"
            ? (catCurrentQuestion ? catSafeIndex + 1 : null)
            : (standardCurrentQuestion ? standardSafeIndex + 1 : null);
        if (activeQuestionNumber == null) {
            onClearLocate();
            return;
        }
        if (activeQuestionNumber !== activeLocateQuestionNumber) {
            onClearLocate();
        }
    }, [
        activeLocateQuestionNumber,
        catCurrentQuestion,
        catSafeIndex,
        onClearLocate,
        quizMode,
        standardCurrentQuestion,
        standardSafeIndex,
    ]);

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
            answers,
            questions,
            responses,
            qualityTier: quizMode === "cat" && typeof catSe === "number" && catSe > 1.25 ? "low_confidence" : "ok",
        });
    }, [
        answers,
        catResponseMap,
        catSe,
        clearAutoCompactTimer,
        clearAutoFinalizeTimer,
        floatingCompact,
        hasReachedCatMin,
        onSubmitScore,
        questions,
        quizMode,
        setIsCatCompactMode,
        setIsSubmitted,
        setScore,
    ]);

    const canSubmitCat = quizMode === "cat"
        ? hasReachedCatMin
        : false;
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
            <div className="flex h-full items-center justify-between gap-3 bg-[#fffaf0] px-4">
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#17120d]">
                        阅读测验 · 第 {Math.min(catSubmittedCount + 1, Math.max(1, questions.length || 1))} 题
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[#7b45e7]">
                        {catSubmittedCount}/{catMaxAllowed} · 至少 {catMinRequired} 题后按精度自动收卷
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {hasReachedCatMin ? (
                        <button
                            onClick={handleFinalizeCatSession}
                            className="rounded-full border-[3px] border-[#17120d] bg-[#eadcff] px-3 py-1.5 text-xs font-black text-[#6d28d9] shadow-[0_3px_0_rgba(23,18,13,0.1)] transition hover:-translate-y-0.5"
                        >
                            结算
                        </button>
                    ) : null}
                    <button
                        onClick={() => {
                            clearAutoCompactTimer();
                            setIsCatCompactMode(false);
                        }}
                        className="rounded-full border-[3px] border-[#17120d] bg-white px-3 py-1.5 text-xs font-black text-[#17120d] shadow-[0_3px_0_rgba(23,18,13,0.1)] transition hover:-translate-y-0.5"
                    >
                        展开作答
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            data-quiz-panel-root="true"
            className="flex h-full min-h-[240px] flex-col overflow-hidden bg-[#fffaf0]"
        >
            {/* Header */}
            <div className="relative flex-shrink-0 border-b-[3px] border-[#17120d] bg-[#fff7ea] px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {titleNode ? titleNode : (
                            <>
                                {!isFloatingCat && <Sparkles className="h-5 w-5 text-[#d9468f]" />}
                                <h3 className={cn("font-newsreader font-bold text-[#17120d]", isFloatingCat ? "text-base" : "text-lg")}>
                                    {isFloatingCat ? "阅读测验" : "阅读理解"}
                                </h3>
                                {isFloatingCat && (
                                    <span className="rounded-full border-[3px] border-[#17120d] bg-white px-2 py-0.5 text-[11px] font-black text-[#5f5448]">
                                        {Math.min(catSubmittedCount + (catCurrentCommitted ? 0 : 1), catMaxAllowed)}/{catMaxAllowed}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {dragHandleNode && (
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                            {dragHandleNode}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {!titleNode && !isFloatingCat && (
                            <span
                                className={cn(
                                    "rounded-full border-[3px] border-[#17120d] px-2.5 py-1 text-xs font-black shadow-[0_3px_0_rgba(23,18,13,0.08)]",
                                    difficulty === "cet4" && "bg-[#b7f0d4] text-[#0f8a69]",
                                    difficulty === "cet6" && "bg-[#dbeafe] text-[#1d4ed8]",
                                    difficulty === "ielts" && "bg-[#eadcff] text-[#7b45e7]",
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
                                className="rounded-full border-[3px] border-[#17120d] bg-white p-1.5 text-[#5f5448] transition hover:-translate-y-0.5 hover:text-[#17120d]"
                                aria-label="收起答题面板"
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border-[3px] border-[#17120d] bg-white p-1.5 text-[#5f5448] transition hover:-translate-y-0.5 hover:text-[#17120d]"
                            aria-label="关闭测试模式"
                            title="关闭测试模式"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
                {score && !isFloatingCat && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 flex items-center gap-3 rounded-[1.25rem] border-[3px] border-[#17120d] bg-white px-4 py-3 shadow-[0_4px_0_rgba(23,18,13,0.1)]"
                    >
                        <Trophy className="h-6 w-6 text-[#f59e0b]" />
                        <div>
                            <div className="text-2xl font-black text-[#17120d]">
                                {score.correct}
                                <span className="text-base font-medium text-[#8b7a66]">
                                    /{score.total}
                                </span>
                            </div>
                            <div className="text-xs font-semibold text-[#7d6e61]">
                                正确率 {Math.round((score.correct / score.total) * 100)}%
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Questions Body */}
            <div className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-y-contain bg-[#fffdf8] px-4 py-3 scrollbar-hide">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center rounded-[1.5rem] border-[3px] border-[#17120d] bg-white py-16 text-[#5f5448] shadow-[0_4px_0_rgba(23,18,13,0.08)]">
                        <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#d9468f]" />
                        <p className="text-sm font-black text-[#17120d]">正在生成题目...</p>
                        <p className="mt-1 text-xs text-[#8b7a66]">
                            AI 正在分析文章并出题
                        </p>
                    </div>
                )}
                {!isLoading && quizMode === "cat" && !isFloatingCat && (
                    <div className="rounded-[1.25rem] border-[3px] border-[#17120d] bg-[#f3e8ff] px-3 py-2 text-xs font-black text-[#7b45e7] shadow-[0_3px_0_rgba(23,18,13,0.08)]">
                        {catAnsweredHint}
                    </div>
                )}
                {!isLoading && quizMode === "cat" && isFloatingCat && (
                    <div className="rounded-[1.1rem] border-[3px] border-[#17120d] bg-[#f3e8ff] px-3 py-1.5 text-[11px] font-black text-[#7b45e7] shadow-[0_3px_0_rgba(23,18,13,0.08)]">
                        已提交 {catSubmittedCount} 题，至少 {catMinRequired} 题后按精度自动收卷
                    </div>
                )}

                {error && (
                    <div className="rounded-[1.25rem] border-[3px] border-[#17120d] bg-[#ffe4ea] px-4 py-3 text-center text-sm font-black text-[#be123c] shadow-[0_3px_0_rgba(23,18,13,0.08)]">
                        {error}
                    </div>
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
                                    index={catSafeIndex}
                                    userAnswer={answers[catCurrentQuestion.id]}
                                    onSelect={handleSelectAnswer}
                                    onTextInput={handleTextAnswer}
                                    isSubmitted={isSubmitted || Boolean(catResponseMap[catCurrentQuestion.id])}
                                    isCorrect={catResponseMap[catCurrentQuestion.id]?.correct}
                                    isExpanded={Boolean(expandedExplanations[catCurrentQuestion.id])}
                                    onToggleExpand={toggleExplanation}
                                    onLocate={onLocate}
                                    onClearLocate={onClearLocate}
                                    activeLocateQuestionNumber={activeLocateQuestionNumber}
                                    compact={isFloatingCat}
                                />
                            </motion.div>
                        ) : (
                            <div className="rounded-[1.25rem] border-[3px] border-[#17120d] bg-white px-4 py-3 text-sm font-semibold text-[#5f5448] shadow-[0_3px_0_rgba(23,18,13,0.08)]">
                                本局题目已完成，可直接结算。
                            </div>
                        )}
                    </AnimatePresence>
                ) : (
                    <AnimatePresence mode="wait">
                        {standardCurrentQuestion ? (
                            <motion.div
                                key={standardCurrentQuestion.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.24 }}
                            >
                                <QuestionCard
                                    question={standardCurrentQuestion}
                                    index={standardSafeIndex}
                                    userAnswer={answers[standardCurrentQuestion.id]}
                                    onSelect={handleSelectAnswer}
                                    onTextInput={handleTextAnswer}
                                    isSubmitted={isSubmitted || standardCurrentGraded}
                                    isCorrect={isSubmitted || standardCurrentGraded ? isCorrect(standardCurrentQuestion) : undefined}
                                    isExpanded={Boolean(expandedExplanations[standardCurrentQuestion.id])}
                                    onToggleExpand={toggleExplanation}
                                    onLocate={onLocate}
                                    onClearLocate={onClearLocate}
                                    activeLocateQuestionNumber={activeLocateQuestionNumber}
                                    compact={false}
                                />
                            </motion.div>
                        ) : (
                            <div className="rounded-[1.25rem] border-[3px] border-[#17120d] bg-white px-4 py-3 text-sm font-semibold text-[#5f5448] shadow-[0_3px_0_rgba(23,18,13,0.08)]">
                                暂无可用题目，请稍后重试。
                            </div>
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* Footer Actions */}
            {questions.length > 0 && (
                <div className="flex-shrink-0 border-t-[3px] border-[#17120d] bg-[#fff7ea] px-4 py-2.5">
                    {!isSubmitted && quizMode === "cat" ? (
                        <div className={cn("flex flex-wrap gap-2.5", isFloatingCat && "gap-2")}>
                            {!catCurrentCommitted ? (
                                <button
                                    onClick={handleSubmitCurrentCatQuestion}
                                    disabled={!catCurrentCanSubmit}
                                    className={cn(
                                        "flex items-center justify-center gap-2 rounded-[1.2rem] border-[3px] text-sm font-black transition-all duration-300",
                                        isFloatingCat ? "min-w-[128px] flex-1 py-2.5" : "min-w-[180px] flex-1 py-3",
                                        catCurrentCanSubmit
                                            ? "border-[#17120d] bg-[#2f66f3] text-white shadow-[0_4px_0_rgba(23,18,13,0.12)] hover:-translate-y-0.5"
                                            : "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
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
                                        "flex items-center justify-center gap-2 rounded-[1.2rem] border-[3px] text-sm font-black transition-all duration-300",
                                        isFloatingCat ? "min-w-[128px] flex-1 py-2.5" : "min-w-[180px] flex-1 py-3",
                                        hasNextQuestion && !hasReachedCatMax
                                            ? "border-[#17120d] bg-white text-[#17120d] shadow-[0_4px_0_rgba(23,18,13,0.12)] hover:-translate-y-0.5"
                                            : "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
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
                                    "flex items-center justify-center gap-2 rounded-[1.2rem] border-[3px] text-sm font-black transition-all duration-300",
                                    isFloatingCat ? "min-w-[128px] py-2.5 px-4" : "min-w-[180px] flex-1 py-3",
                                    canSubmitCat
                                        ? "border-[#17120d] bg-[#eadcff] text-[#6d28d9] shadow-[0_4px_0_rgba(23,18,13,0.12)] hover:-translate-y-0.5"
                                        : "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
                                )}
                            >
                                {isFloatingCat ? "结算" : "完成本局结算"}
                            </button>
                        </div>
                    ) : !isSubmitted ? (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">
                                {standardProgressHint}
                            </p>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={handlePrevStandardQuestion}
                                    disabled={standardAtFirst}
                                    className={cn(
                                        "flex min-w-[120px] items-center justify-center gap-2 rounded-[1.2rem] border-[3px] py-3 text-sm font-black transition-all duration-300",
                                        standardAtFirst
                                            ? "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
                                            : "border-[#17120d] bg-white text-[#17120d] shadow-[0_4px_0_rgba(23,18,13,0.1)] hover:-translate-y-0.5"
                                    )}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    上一题
                                </button>
                                {!standardAtLast ? (
                                    standardCurrentGraded ? (
                                        <button
                                            onClick={handleNextStandardQuestion}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] border-[#17120d] bg-white py-3 text-sm font-black text-[#17120d] shadow-[0_4px_0_rgba(23,18,13,0.1)] transition-all duration-300 hover:-translate-y-0.5"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                            下一题
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleGradeStandardQuestion}
                                            disabled={!standardCurrentAnswered}
                                            className={cn(
                                                "flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] py-3 text-sm font-black transition-all duration-300",
                                                standardCurrentAnswered
                                                    ? "border-[#17120d] bg-[#2f66f3] text-white shadow-[0_4px_0_rgba(23,18,13,0.12)] hover:-translate-y-0.5"
                                                    : "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
                                            )}
                                        >
                                            <Send className="h-4 w-4" />
                                            批改本题
                                        </button>
                                    )
                                ) : (
                                    standardCurrentGraded ? (
                                        <button
                                            onClick={handleFinalizeStandardSession}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] border-[#17120d] bg-[#2f66f3] py-3 text-sm font-black text-white shadow-[0_4px_0_rgba(23,18,13,0.12)] transition-all duration-300 hover:-translate-y-0.5"
                                        >
                                            <Send className="h-4 w-4" />
                                            完成批改
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleGradeStandardQuestion}
                                            disabled={!standardCurrentAnswered}
                                            className={cn(
                                                "flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] py-3 text-sm font-black transition-all duration-300",
                                                standardCurrentAnswered
                                                    ? "border-[#17120d] bg-[#2f66f3] text-white shadow-[0_4px_0_rgba(23,18,13,0.12)] hover:-translate-y-0.5"
                                                    : "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
                                            )}
                                        >
                                            <Send className="h-4 w-4" />
                                            批改本题
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">
                                {quizMode === "cat"
                                    ? `复盘第 ${catSafeIndex + 1} / ${Math.max(1, catQuestionCount)} 题`
                                    : `复盘第 ${standardSafeIndex + 1} / ${Math.max(1, standardQuestionCount)} 题`}
                            </p>
                            <div className="flex gap-3">
                            {quizMode !== "cat" && !lockAfterCompletion ? (
                                <button
                                    onClick={handleReset}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] border-[#17120d] bg-white py-3 text-sm font-black text-[#17120d] transition-all hover:-translate-y-0.5"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    重做
                                </button>
                            ) : null}
                            <button
                                onClick={handlePrevSubmittedQuestion}
                                disabled={quizMode === "cat" ? catAtFirst : standardAtFirst}
                                className={cn(
                                    "flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] py-3 text-sm font-black transition-all",
                                    (quizMode === "cat" ? catAtFirst : standardAtFirst)
                                        ? "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
                                        : "border-[#17120d] bg-white text-[#17120d] hover:-translate-y-0.5"
                                )}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                上一题
                            </button>
                            <button
                                onClick={handleNextSubmittedQuestion}
                                disabled={quizMode === "cat" ? catAtLast : standardAtLast}
                                className={cn(
                                    "flex flex-1 items-center justify-center gap-2 rounded-[1.2rem] border-[3px] py-3 text-sm font-black transition-all",
                                    (quizMode === "cat" ? catAtLast : standardAtLast)
                                        ? "border-[#17120d] bg-[#d7d4cc] text-[#8b7a66] cursor-not-allowed"
                                        : "border-[#17120d] bg-[#2f66f3] text-white shadow-[0_4px_0_rgba(23,18,13,0.12)] hover:-translate-y-0.5"
                                )}
                            >
                                下一题
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            </div>
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
    onClearLocate,
    activeLocateQuestionNumber,
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
    onClearLocate?: () => void;
    activeLocateQuestionNumber?: number | null;
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
    const isLocateActive = Boolean(activeLocateQuestionNumber === index + 1);

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
        <div
            className={cn(
                compact ? "rounded-[1.35rem] p-3.5 transition-all duration-300" : "rounded-[1.6rem] p-4 transition-all duration-300",
                "border-[3px] border-[#17120d] bg-white shadow-[0_5px_0_rgba(23,18,13,0.08)]",
                isSubmitted && isCorrect && "bg-[#f0fff4]",
                isSubmitted && !isCorrect && "bg-[#fff5f7]",
            )}
        >
            {/* Question Header */}
            <div className={cn("flex items-start gap-2", compact ? "mb-2.5" : "mb-3")}>
                <span className={cn(
                    "flex flex-shrink-0 items-center justify-center rounded-full border-[3px] border-[#17120d] bg-[#17120d] text-[10px] font-black text-white",
                    compact ? "h-5 w-5" : "h-6 w-6"
                )}>
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                        {!compact && (
                            <span className="rounded-full border-2 border-[#17120d] bg-[#fff7d8] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#9a6700]">
                                {typeLabels[question.type] || question.type}
                            </span>
                        )}
                        {!compact && isMultipleSelect && (
                            <span className="rounded-full border-2 border-[#17120d] bg-[#dbeafe] px-2 py-0.5 text-[10px] font-black text-[#1d4ed8]">
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
                    <p className={cn("font-medium leading-relaxed text-[#17120d]", compact ? "text-[15px]" : "text-sm")}>
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
                                    "w-full rounded-[1.1rem] border-[3px] text-left transition-all duration-200",
                                    compact ? "px-3 py-2 text-[15px]" : "px-3 py-2.5 text-sm",
                                    !isSubmitted && isSelected && "border-[#17120d] bg-[#2f66f3] text-white shadow-[0_4px_0_rgba(23,18,13,0.1)]",
                                    !isSubmitted && !isSelected && "border-[#17120d] bg-[#fffdf8] text-[#4f4336] hover:-translate-y-0.5 hover:bg-[#fff7ea]",
                                    isSubmitted && isCorrectOption && "border-[#17120d] bg-[#d1fae5] text-[#065f46]",
                                    isSubmitted && isSelected && !isCorrectOption && "border-[#17120d] bg-[#ffe4ea] text-[#be123c]",
                                    isSubmitted && !isSelected && !isCorrectOption && "border-[#17120d] bg-[#f4efe4] text-[#8b7a66]"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    {isMultipleSelect ? (
                                        <span className={cn(
                                            "inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 text-[10px] font-black",
                                            isSelected
                                                ? "border-white bg-white/15 text-white"
                                                : "border-[#17120d] bg-white text-[#8b7a66]"
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
                        className="w-full rounded-[1.1rem] border-[3px] border-[#17120d] bg-[#fffdf8] px-3 py-2.5 text-sm text-[#17120d] placeholder:text-[#9d8e7c] transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                    <div className="rounded-[1.1rem] border-[3px] border-[#17120d] bg-[#fff4d7] px-3 py-2.5 shadow-[0_3px_0_rgba(23,18,13,0.08)]">
                        <p className="mb-1 text-xs font-black text-[#9a6700]">
                            {isCorrect ? "✓ 正确" : `✗ 正确答案：${correctAnswerText}`}
                        </p>
                        <p className="text-xs leading-relaxed text-[#6a4a12]">
                            {explanationData.summary || "该题可根据原文关键信息定位作答。"}
                        </p>

                        {!compact && (question.sourceParagraph || explanationData.evidence) && (
                            <div className="mt-2 rounded-[1rem] border-[3px] border-[#17120d] bg-white px-2.5 py-2">
                                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-[#9a6700]">
                                    <BookMarked className="h-3.5 w-3.5" />
                                    <span>定位依据</span>
                                    {question.sourceParagraph && (
                                        <span className="rounded-full border-2 border-[#17120d] bg-[#fff7d8] px-1.5 py-0.5 text-[10px] text-[#17120d]">
                                            段落 {question.sourceParagraph}
                                        </span>
                                    )}
                                </div>
                                {explanationData.evidence && (
                                    <p className="text-[11px] leading-relaxed text-[#4f4336]">
                                        {explanationData.evidence}
                                    </p>
                                )}
                                {question.sourceParagraph && onLocate && (
                                    <button
                                        onClick={() => {
                                            if (isLocateActive) {
                                                onClearLocate?.();
                                                return;
                                            }
                                            onLocate({
                                                questionNumber: index + 1,
                                                sourceParagraph: question.sourceParagraph as string,
                                                evidence: explanationData.evidence,
                                            });
                                        }}
                                        className={cn(
                                            "mt-2 inline-flex items-center rounded-full border-[3px] px-2.5 py-1 text-[11px] font-black transition-colors",
                                            isLocateActive
                                                ? "border-[#17120d] bg-[#ffe08a] text-[#17120d]"
                                                : "border-[#17120d] bg-[#fff7d8] text-[#9a6700] hover:-translate-y-0.5",
                                        )}
                                    >
                                        {isLocateActive ? `取消定位（第${index + 1}题）` : `定位到原文（第${index + 1}题）`}
                                    </button>
                                )}
                            </div>
                        )}

                        {!compact && (explanationData.reasoning || explanationData.trap) && (
                            <div className="mt-2">
                                <button
                                    onClick={() => onToggleExpand(question.id)}
                                    className="flex items-center gap-1.5 text-[11px] font-black text-[#9a6700] transition-colors hover:text-[#7c5300]"
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
                                            <div className="mt-2 space-y-2 rounded-[1rem] border-[3px] border-[#17120d] bg-white px-2.5 py-2">
                                                {explanationData.reasoning && (
                                                    <div>
                                                        <p className="mb-0.5 flex items-center gap-1 text-[11px] font-black text-[#9a6700]">
                                                            <Lightbulb className="h-3.5 w-3.5" />
                                                            解题思路
                                                        </p>
                                                        <p className="text-[11px] leading-relaxed text-[#4f4336]">
                                                            {explanationData.reasoning}
                                                        </p>
                                                    </div>
                                                )}
                                                {explanationData.trap && (
                                                    <div>
                                                        <p className="mb-0.5 text-[11px] font-black text-[#9a6700]">
                                                            易错点
                                                        </p>
                                                        <p className="text-[11px] leading-relaxed text-[#4f4336]">
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
        </div>
    );
}
