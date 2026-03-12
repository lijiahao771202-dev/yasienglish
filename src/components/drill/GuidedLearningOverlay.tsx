"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Sparkles, X } from "lucide-react";

import {
    buildGuidedClozeTokens,
    buildGuidedTemplateTokens,
    type GuidedAiHint,
    type GuidedClozeState,
    type GuidedModeStatus,
    type GuidedScript,
} from "@/lib/guidedLearning";
import { cn } from "@/lib/utils";

type GuidedInnerMode = "teacher_guided" | "gestalt_cloze";

interface GuidedLearningOverlayProps {
    open: boolean;
    status: GuidedModeStatus;
    script: GuidedScript | null;
    innerMode: GuidedInnerMode;
    currentStepIndex: number;
    currentAttemptCount: number;
    guidedChoicesVisible: boolean;
    guidedRevealReady: boolean;
    filledFragments: Record<string, string>;
    clozeState: GuidedClozeState | null;
    currentInput: string;
    currentAiHint: GuidedAiHint | null;
    isAiHintLoading: boolean;
    onInputChange: (value: string) => void;
    onSubmit: () => void;
    onShowChoices: () => void;
    onSelectChoice: (choiceText: string) => void;
    onRevealAnswer: () => void;
    onActivateRandomFill: () => void;
    onReturnToTeacherGuided: () => void;
    onReturnToBattle: () => void;
    onCloseLearning: () => void;
}

export function GuidedLearningOverlay({
    open,
    status,
    script,
    innerMode,
    currentStepIndex,
    currentAttemptCount,
    guidedChoicesVisible,
    guidedRevealReady,
    filledFragments,
    clozeState,
    currentInput,
    currentAiHint,
    isAiHintLoading,
    onInputChange,
    onSubmit,
    onShowChoices,
    onSelectChoice,
    onRevealAnswer,
    onActivateRandomFill,
    onReturnToTeacherGuided,
    onReturnToBattle,
    onCloseLearning,
}: GuidedLearningOverlayProps) {
    const currentInputRef = useRef<HTMLInputElement | null>(null);
    const teacherCurrentSlot = script?.slots[currentStepIndex] ?? null;
    const clozeCurrentSlot = script && clozeState
        ? script.slots.find((slot) => slot.id === clozeState.blankSlotIds[clozeState.currentBlankIndex]) ?? null
        : null;
    const currentSlot = innerMode === "gestalt_cloze" ? clozeCurrentSlot : teacherCurrentSlot;
    const teacherTokens = script
        ? buildGuidedTemplateTokens(script, filledFragments, currentStepIndex, currentInput)
        : [];
    const clozeTokens = script && clozeState
        ? buildGuidedClozeTokens(script, clozeState, currentInput)
        : [];
    const templateTokens = innerMode === "gestalt_cloze" ? clozeTokens : teacherTokens;
    const clozeAttemptCount = clozeState?.currentAttemptCount ?? 0;
    const clozeRevealReady = clozeState?.revealReady ?? false;
    const isSummary = status === "complete";

    useEffect(() => {
        if (!open || !currentSlot) return;
        currentInputRef.current?.focus();
        currentInputRef.current?.select();
    }, [currentSlot, currentStepIndex, open]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[110] rounded-[2.5rem] bg-stone-950/35 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 280, damping: 28 }}
                        className="absolute inset-0 z-[111] flex items-center justify-center p-4 md:p-8"
                    >
                        <div className="flex h-full max-h-[900px] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
                            <div className="border-b border-stone-200/70 px-5 py-4 md:px-7">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">
                                            <BookOpen className="h-4 w-4" />
                                            Guided Learning
                                        </div>
                                        <h3 className="mt-2 text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
                                            {innerMode === "gestalt_cloze" ? "帮你随机填空，再顺着推整句" : "老师带你一格一格写整句"}
                                        </h3>
                                        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                                            {script?.lesson_intro || "系统正在为你准备单词级引导。"}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onCloseLearning}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition-all hover:border-stone-300 hover:text-stone-700"
                                        title="结束学习"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                {script ? (
                                    <div className="mt-5 space-y-4">
                                        <div className="rounded-[1.35rem] border border-amber-100 bg-amber-50/70 p-4">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">中文原句</p>
                                            <p className="mt-2 text-xl font-semibold leading-8 text-stone-900">
                                                {script.summary.chinese_meaning}
                                            </p>
                                        </div>

                                        <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/80 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-500">
                                                        {innerMode === "gestalt_cloze" ? "帮我随机填空" : "老师带写"}
                                                    </p>
                                                    {innerMode === "gestalt_cloze" ? (
                                                        <button
                                                            type="button"
                                                            onClick={onReturnToTeacherGuided}
                                                            className="inline-flex min-h-8 items-center justify-center rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600 transition-all hover:border-stone-300 hover:text-stone-800"
                                                        >
                                                            回到老师带写
                                                        </button>
                                                    ) : null}
                                                </div>
                                                <p className="text-xs font-semibold text-indigo-500">
                                                    {innerMode === "gestalt_cloze" && clozeState
                                                        ? `${Math.min(clozeState.currentBlankIndex, clozeState.blankSlotIds.length)}/${clozeState.blankSlotIds.length} 已补完`
                                                        : `${Math.min(currentStepIndex, script.slots.length)}/${script.slots.length} 已完成`}
                                                </p>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={onActivateRandomFill}
                                                    className="inline-flex min-h-9 items-center justify-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition-all hover:-translate-y-0.5 hover:border-indigo-300"
                                                >
                                                    {innerMode === "gestalt_cloze" ? "再换一组随机填空" : "帮我随机填空"}
                                                </button>
                                                {innerMode === "gestalt_cloze" ? (
                                                    <p className="self-center text-xs text-stone-500">系统先帮你填一部分词，你顺着上下文把剩下的推出去。</p>
                                                ) : (
                                                    <p className="self-center text-xs text-stone-500">如果你想先看整体轮廓，可以让系统随机帮你留一部分词。</p>
                                                )}
                                            </div>
                                            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-3 text-lg font-semibold leading-8 text-stone-900 md:text-xl">
                                                {templateTokens.map((token, index) => (
                                                    token.type === "text" ? (
                                                        <span key={`text-${index}`} className="whitespace-pre-wrap">
                                                            {token.value}
                                                        </span>
                                                    ) : (
                                                        <span
                                                            key={token.slotId}
                                                            className={cn(
                                                                "relative inline-flex h-12 items-end justify-center px-1 pb-2 font-mono text-base tracking-[0.08em] transition-all",
                                                                token.status === "filled" && "text-emerald-700",
                                                                token.status === "current" && "text-indigo-700",
                                                                token.status === "locked" && "text-stone-300",
                                                            )}
                                                            style={{ width: `${token.inputWidthCh ?? 6}ch` }}
                                                        >
                                                            <span className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-center gap-[3px]">
                                                                {Array.from({ length: Math.max((token.inputWidthCh ?? 6) - 1, 2) }).map((_, segmentIndex) => (
                                                                    <span
                                                                        key={`${token.slotId}-segment-${segmentIndex}`}
                                                                        className={cn(
                                                                            "h-[3px] flex-1 rounded-full",
                                                                            token.status === "filled" && "bg-emerald-500/75",
                                                                            token.status === "current" && "bg-indigo-500/85",
                                                                            token.status === "locked" && "bg-slate-300/95",
                                                                        )}
                                                                    />
                                                                ))}
                                                            </span>
                                                            {token.status === "current" && currentSlot ? (
                                                                <input
                                                                    ref={currentInputRef}
                                                                    value={currentInput}
                                                                    onChange={(event) => onInputChange(event.target.value)}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === "Enter") {
                                                                            event.preventDefault();
                                                                            onSubmit();
                                                                        }
                                                                    }}
                                                                    style={{ width: `${token.inputWidthCh ?? 6}ch` }}
                                                                    className="bg-transparent pb-0.5 text-center font-mono text-base tracking-[0.08em] text-indigo-700 outline-none"
                                                                />
                                                            ) : token.status === "filled" ? token.value : null}
                                                        </span>
                                                    )
                                                ))}
                                            </div>

                                            {innerMode === "teacher_guided" && currentSlot ? (
                                                <div className="mt-4 rounded-[1rem] border border-white/70 bg-white/92 px-4 py-3">
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-500">
                                                        老师现在这样带你想
                                                    </p>
                                                    <p className="mt-2 text-base font-semibold leading-7 text-stone-900">
                                                        {currentAiHint?.primary || (isAiHintLoading ? "老师正在组织这一步的提示……" : "老师正在组织这一步的提示……")}
                                                    </p>
                                                    {currentAiHint?.secondary ? (
                                                        <p className="mt-2 text-sm leading-6 text-stone-600">
                                                            {currentAiHint.secondary}
                                                        </p>
                                                    ) : null}
                                                    {(guidedChoicesVisible || guidedRevealReady) && currentAiHint?.rescue ? (
                                                        <p className="mt-2 text-sm font-medium leading-6 text-amber-700">
                                                            {currentAiHint.rescue}
                                                        </p>
                                                    ) : null}

                                                    {currentSlot.multiple_choice?.length || guidedRevealReady ? (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {guidedChoicesVisible ? (
                                                                currentSlot.multiple_choice?.map((choice) => (
                                                                    <button
                                                                        key={`${currentSlot.id}-${choice.text}`}
                                                                        type="button"
                                                                        onClick={() => onSelectChoice(choice.text)}
                                                                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-100"
                                                                    >
                                                                        {choice.text}
                                                                    </button>
                                                                ))
                                                            ) : currentSlot.multiple_choice?.length ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={onShowChoices}
                                                                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300"
                                                                >
                                                                    我不会拼，给我选项
                                                                </button>
                                                            ) : null}
                                                            {guidedRevealReady ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={onRevealAnswer}
                                                                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-all hover:-translate-y-0.5 hover:border-amber-300"
                                                                >
                                                                    直接显示这一格
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            {innerMode === "gestalt_cloze" ? (
                                                <div className="mt-4 rounded-[1rem] border border-white/70 bg-white/92 px-4 py-3">
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-500">
                                                        顺着整句往回推
                                                    </p>
                                                    <p className="mt-2 text-base font-semibold leading-7 text-stone-900">
                                                        {currentAiHint?.primary || (isAiHintLoading ? "老师正在根据你现在这格重新想提示……" : "老师正在根据你现在这格重新想提示……")}
                                                    </p>
                                                    {currentAiHint?.secondary ? (
                                                        <p className="mt-2 text-sm leading-6 text-stone-600">{currentAiHint.secondary}</p>
                                                    ) : null}
                                                    {clozeAttemptCount >= 2 && currentAiHint?.rescue ? (
                                                        <p className="mt-2 text-sm font-medium leading-6 text-amber-700">
                                                            {currentAiHint.rescue}
                                                        </p>
                                                    ) : null}
                                                    {clozeRevealReady ? (
                                                        <div className="mt-3">
                                                            <button
                                                                type="button"
                                                                onClick={onRevealAnswer}
                                                                className="inline-flex min-h-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-all hover:-translate-y-0.5 hover:border-amber-300"
                                                            >
                                                                直接显示这一格
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-6">
                                    {status === "loading" || !script ? (
                                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 text-center">
                                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                                                <Sparkles className="h-7 w-7 animate-spin" />
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold text-stone-800">正在准备挖空句子</p>
                                                <p className="mt-1 text-sm text-stone-500">马上开始一词一格填空。</p>
                                            </div>
                                        </div>
                                    ) : isSummary ? (
                                        <div className="space-y-5">
                                            <div className="rounded-[1.6rem] border border-emerald-100 bg-emerald-50/60 p-5">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">完整句子</p>
                                                <p className="mt-3 text-2xl font-bold italic leading-relaxed text-stone-900 md:text-3xl">
                                                    {script.summary.final_sentence}
                                                </p>
                                                <p className="mt-2 text-sm text-stone-500">{script.summary.chinese_meaning}</p>
                                            </div>

                                            <div className="rounded-[1.4rem] border border-stone-200 bg-white p-5">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">结构公式</p>
                                                <p className="mt-3 text-lg font-semibold text-stone-800">{script.summary.structure_hint}</p>
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                {script.summary.chinglish_alerts.map((alert, index) => (
                                                    <div key={`${alert.wrong}-${index}`} className="rounded-[1.4rem] border border-rose-100 bg-rose-50/50 p-5">
                                                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-500">Chinglish Alert</p>
                                                        <p className="mt-3 text-sm text-rose-500 line-through">{alert.wrong}</p>
                                                        <p className="mt-2 text-base font-semibold text-stone-900">{alert.correct}</p>
                                                        <p className="mt-2 text-sm leading-6 text-stone-500">{alert.explanation}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/60 p-5">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600">记忆点</p>
                                                <p className="mt-3 text-sm leading-6 text-stone-700">{script.summary.memory_anchor}</p>
                                            </div>

                                            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                                <button
                                                    type="button"
                                                    onClick={onReturnToBattle}
                                                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300"
                                                >
                                                    返回原题界面
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={onCloseLearning}
                                                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#111827_0%,#1f2937_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_-16px_rgba(17,24,39,0.5)] transition-all hover:-translate-y-0.5"
                                                >
                                                    结束学习
                                                </button>
                                            </div>
                                        </div>
                                    ) : currentSlot ? (
                                        <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
                                            <p className="text-sm text-stone-400">继续直接在当前空格里输入，系统会自动推进。</p>
                                        </div>
                                    ) : null}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
