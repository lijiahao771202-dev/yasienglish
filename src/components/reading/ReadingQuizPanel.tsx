"use client";

import { useState, useEffect } from "react";
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

export interface QuizQuestion {
    id: number;
    type: "multiple_choice" | "short_answer" | "true_false_ng" | "matching" | "fill_blank";
    question: string;
    options?: string[];
    answer: string;
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
}

function normalizeQuestion(raw: unknown, index: number): QuizQuestion | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Partial<QuizQuestion>;
    if (typeof candidate.question !== "string") return null;

    const questionType = candidate.type;
    const normalizedType: QuizQuestion["type"] =
        questionType === "multiple_choice"
        || questionType === "short_answer"
        || questionType === "true_false_ng"
        || questionType === "matching"
        || questionType === "fill_blank"
            ? questionType
            : "multiple_choice";

    const rawOptions = Array.isArray(candidate.options)
        ? candidate.options.filter((opt): opt is string => typeof opt === "string" && opt.trim().length > 0)
        : [];

    const answer = typeof candidate.answer === "string" ? candidate.answer.trim() : "";
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

    // For option questions, missing answer means this item is unusable.
    if (rawOptions.length > 0 && !answer) {
        return null;
    }

    return {
        id: typeof candidate.id === "number" ? candidate.id : index + 1,
        type: normalizedType,
        question: candidate.question.trim(),
        options: rawOptions.length > 0 ? rawOptions : undefined,
        answer,
        explanation: explanationObj ?? explanation,
        sourceParagraph: typeof candidate.sourceParagraph === "string" ? candidate.sourceParagraph : undefined,
        evidence: typeof candidate.evidence === "string" ? candidate.evidence : explanationObj?.evidence,
        reasoning: typeof candidate.reasoning === "string" ? candidate.reasoning : explanationObj?.reasoning,
        trap: typeof candidate.trap === "string" ? candidate.trap : explanationObj?.trap,
    };
}

interface ReadingQuizPanelProps {
    articleContent: string;
    articleTitle: string;
    difficulty: "cet4" | "cet6" | "ielts";
    onClose: () => void;
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
    onClose,
}: ReadingQuizPanelProps) {
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // User answers: key = question id, value = selected answer
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
    const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});

    const diffMeta = DIFFICULTY_META[difficulty] || DIFFICULTY_META.ielts;
    const getAnswerInitial = (question: QuizQuestion): string =>
        typeof question.answer === "string" ? question.answer.charAt(0).toUpperCase() : "";

    // Fetch quiz questions on mount
    useEffect(() => {
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
    }, [articleContent, difficulty, articleTitle]);

    const handleSelectAnswer = (questionId: number, answer: string) => {
        if (isSubmitted) return;
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    };

    const handleTextAnswer = (questionId: number, text: string) => {
        if (isSubmitted) return;
        setAnswers((prev) => ({ ...prev, [questionId]: text }));
    };

    const handleSubmit = () => {
        let correct = 0;
        questions.forEach((q) => {
            const userAnswer = (answers[q.id] || "").trim();
            if (q.type === "short_answer" || q.type === "fill_blank") {
                if (!q.answer) return;
                // For text-based answers, do case-insensitive includes check
                if (
                    userAnswer.toLowerCase().includes(q.answer.toLowerCase()) ||
                    q.answer.toLowerCase().includes(userAnswer.toLowerCase())
                ) {
                    correct++;
                }
            } else {
                // For choice-based, compare the letter/value
                const answerLetter = userAnswer.charAt(0).toUpperCase();
                const correctLetter = getAnswerInitial(q);
                if (answerLetter === correctLetter) {
                    correct++;
                }
            }
        });
        setScore({ correct, total: questions.length });
        setIsSubmitted(true);
    };

    const handleReset = () => {
        setAnswers({});
        setIsSubmitted(false);
        setScore(null);
        setExpandedExplanations({});
    };

    const isCorrect = (q: QuizQuestion): boolean => {
        const userAnswer = (answers[q.id] || "").trim();
        if (q.type === "short_answer" || q.type === "fill_blank") {
            if (!q.answer) return false;
            return (
                userAnswer.toLowerCase().includes(q.answer.toLowerCase()) ||
                q.answer.toLowerCase().includes(userAnswer.toLowerCase())
            );
        }
        return userAnswer.charAt(0).toUpperCase() === getAnswerInitial(q);
    };

    const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]?.trim());
    const toggleExplanation = (questionId: number) => {
        setExpandedExplanations((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-white/40 px-5 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-pink-500" />
                        <h3 className="font-newsreader text-lg font-bold text-slate-900">
                            阅读理解
                        </h3>
                    </div>
                    <span
                        className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-bold",
                            diffMeta.bgClass,
                            diffMeta.color
                        )}
                    >
                        {diffMeta.label}
                    </span>
                </div>
                {score && (
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
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 scrollbar-hide">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <Loader2 className="mb-4 h-8 w-8 animate-spin text-pink-400" />
                        <p className="text-sm font-medium">正在生成题目...</p>
                        <p className="mt-1 text-xs text-slate-400">
                            AI 正在分析文章并出题
                        </p>
                    </div>
                )}

                {error && (
                    <LiquidGlassPanel className="rounded-xl px-4 py-3 text-center text-sm text-red-600">
                        {error}
                    </LiquidGlassPanel>
                )}

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
                                userAnswer={answers[q.id] || ""}
                                onSelect={handleSelectAnswer}
                                onTextInput={handleTextAnswer}
                                isSubmitted={isSubmitted}
                                isCorrect={isSubmitted ? isCorrect(q) : undefined}
                                isExpanded={Boolean(expandedExplanations[q.id])}
                                onToggleExpand={toggleExplanation}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Footer Actions */}
            {questions.length > 0 && (
                <div className="flex-shrink-0 border-t border-white/40 px-5 py-4">
                    {!isSubmitted ? (
                        <button
                            onClick={handleSubmit}
                            disabled={!allAnswered}
                            className={cn(
                                "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all duration-300",
                                allAnswered
                                    ? "border border-white/60 bg-white/70 text-slate-800 shadow-[0_14px_30px_-20px_rgba(15,23,42,0.7)] hover:bg-white/90"
                                    : "border border-white/40 bg-white/30 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            <Send className="h-4 w-4" />
                            提交答案
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={handleReset}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/50 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-white/70"
                            >
                                <RotateCcw className="h-4 w-4" />
                                重做
                            </button>
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
}: {
    question: QuizQuestion;
    index: number;
    userAnswer: string;
    onSelect: (id: number, answer: string) => void;
    onTextInput: (id: number, text: string) => void;
    isSubmitted: boolean;
    isCorrect?: boolean;
    isExpanded: boolean;
    onToggleExpand: (id: number) => void;
}) {
    const typeLabels: Record<string, string> = {
        multiple_choice: "选择",
        short_answer: "简答",
        true_false_ng: "判断",
        matching: "匹配",
        fill_blank: "填空",
    };

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
                "rounded-2xl p-4 transition-all duration-300",
                isSubmitted && isCorrect && "ring-1 ring-emerald-300/60",
                isSubmitted && !isCorrect && "ring-1 ring-rose-300/60"
            )}
        >
            {/* Question Header */}
            <div className="mb-3 flex items-start gap-2">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-md bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {typeLabels[question.type] || question.type}
                        </span>
                        {isSubmitted && (
                            isCorrect ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <XCircle className="h-4 w-4 text-rose-500" />
                            )
                        )}
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-slate-800">
                        {question.question}
                    </p>
                </div>
            </div>

            {/* Answer Area */}
            {question.options && question.options.length > 0 ? (
                <div className="space-y-2 pl-8">
                    {question.options.map((option) => {
                        const optionLetter = option.charAt(0).toUpperCase();
                        const isSelected = userAnswer.charAt(0).toUpperCase() === optionLetter;
                        const answerInitial = typeof question.answer === "string" ? question.answer.charAt(0).toUpperCase() : "";
                        const isCorrectOption = isSubmitted && answerInitial === optionLetter;
                        return (
                            <button
                                key={option}
                                onClick={() => onSelect(question.id, option)}
                                disabled={isSubmitted}
                                className={cn(
                                    "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-200",
                                    !isSubmitted && isSelected && "border-cyan-300 bg-cyan-50/80 text-slate-900 shadow-sm",
                                    !isSubmitted && !isSelected && "border-white/60 bg-white/40 text-slate-600 hover:bg-white/60",
                                    isSubmitted && isCorrectOption && "border-emerald-300 bg-emerald-50/80 text-emerald-800",
                                    isSubmitted && isSelected && !isCorrectOption && "border-rose-300 bg-rose-50/80 text-rose-700",
                                    isSubmitted && !isSelected && !isCorrectOption && "border-white/40 bg-white/25 text-slate-400"
                                )}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
            ) : (
                /* Text input for short_answer / fill_blank */
                <div className="pl-8">
                    <textarea
                        value={userAnswer}
                        onChange={(e) => onTextInput(question.id, e.target.value)}
                        disabled={isSubmitted}
                        placeholder="Type your answer here..."
                        className="w-full rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-colors focus:border-cyan-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        rows={2}
                    />
                </div>
            )}

            {/* Explanation (after submit) */}
            {isSubmitted && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.3 }}
                    className="mt-3 ml-8 overflow-hidden"
                >
                    <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-3 py-2.5">
                        <p className="mb-1 text-xs font-semibold text-amber-700">
                            {isCorrect ? "✓ 正确" : `✗ 正确答案：${question.answer}`}
                        </p>
                        <p className="text-xs leading-relaxed text-amber-800/90">
                            {explanationData.summary || "该题可根据原文关键信息定位作答。"}
                        </p>

                        {(question.sourceParagraph || explanationData.evidence) && (
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
                            </div>
                        )}

                        {(explanationData.reasoning || explanationData.trap) && (
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
