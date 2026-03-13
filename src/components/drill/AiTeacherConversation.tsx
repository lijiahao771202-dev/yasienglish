"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpenText, Sparkles, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type TutorResponseIntent =
    | "word_meaning"
    | "collocation"
    | "partial_phrase"
    | "pattern"
    | "naturalness"
    | "full_sentence"
    | "unlock_answer";

export interface TutorStructuredResponse {
    coach_markdown: string;
    response_intent?: TutorResponseIntent;
    answer_revealed: boolean;
    full_answer?: string;
    answer_reason_cn?: string;
    teaching_point: string;
    error_tags: string[];
    quality_flags: string[];
}

export interface TutorHistoryTurn extends TutorStructuredResponse {
    question: string;
    question_type: string;
}

export function TutorMarkdown({ content, className }: { content: string; className?: string }) {
    return (
        <div className={cn("prose prose-sm max-w-none text-inherit leading-7 prose-p:my-2 prose-ol:my-3 prose-ol:space-y-2 prose-ul:my-3 prose-ul:space-y-1.5", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="my-2 text-inherit">{children}</p>,
                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-2.5 pl-6 marker:font-semibold marker:text-amber-700">{children}</ol>,
                    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-stone-400">{children}</ul>,
                    li: ({ children }) => <li className="my-1 leading-7">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="my-2 rounded-r-lg border-l-4 border-sky-300 bg-sky-50/60 px-3 py-2 text-sky-900">
                            {children}
                        </blockquote>
                    ),
                    strong: ({ children }) => (
                        <strong className="rounded-[6px] bg-amber-100/90 px-1.5 py-0.5 font-semibold text-amber-950 shadow-[inset_0_-1px_0_rgba(251,191,36,0.35)]">
                            {children}
                        </strong>
                    ),
                    code: ({ children, className: codeClassName, ...props }) => {
                        const isInline = !String(codeClassName || "").includes("language-");
                        if (isInline) {
                            return (
                                <code className="rounded-md border border-sky-100 bg-sky-50/85 px-1.5 py-0.5 text-[0.9em] font-medium text-sky-800">
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className={cn("text-xs", codeClassName)} {...props}>
                                {children}
                            </code>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

interface AiTeacherConversationProps {
    turns: TutorHistoryTurn[];
    pendingQuestion?: string | null;
    pendingAnswer?: string | null;
    fallbackAnswer?: string | null;
    onPlayCardAudio: (text: string) => void;
}

function PlayCardButton({
    text,
    onPlay,
}: {
    text: string;
    onPlay: (text: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onPlay(text)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-600 transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white"
            title="播放"
        >
            <Volume2 className="h-4 w-4" />
        </button>
    );
}


export function AiTeacherConversation({
    turns,
    pendingQuestion,
    pendingAnswer,
    fallbackAnswer,
    onPlayCardAudio,
}: AiTeacherConversationProps) {
    return (
        <div className="space-y-4">
            {turns.map((turn, index) => (
                <article
                    key={`${turn.question}-${index}`}
                    className="overflow-hidden rounded-[1.55rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(251,247,242,0.92))] shadow-[0_18px_42px_rgba(148,113,78,0.08)]"
                >
                    <div className="border-b border-stone-100/90 bg-[linear-gradient(180deg,rgba(255,247,251,0.85),rgba(255,255,255,0.68))] px-4 py-3.5">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-pink-700">
                                你问
                            </span>
                            <p className="text-[15px] leading-7 text-stone-800">{turn.question}</p>
                        </div>
                    </div>

                    <div className="space-y-3.5 px-4 py-4">
                        <div className="rounded-[1.2rem] border border-stone-200/80 bg-white/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                老师这样拆给你
                            </div>
                            <TutorMarkdown content={turn.coach_markdown} className="text-[15px] text-stone-700" />
                        </div>

                        {turn.answer_revealed && turn.full_answer ? (
                            <section className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50/70 p-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">参考表达</p>
                                    <PlayCardButton text={turn.full_answer} onPlay={onPlayCardAudio} />
                                </div>
                                <p className="mt-1.5 break-words font-newsreader text-lg leading-8 text-stone-800">{turn.full_answer}</p>
                                {turn.answer_reason_cn ? (
                                    <p className="mt-2 text-xs leading-6 text-stone-600">{turn.answer_reason_cn}</p>
                                ) : null}
                            </section>
                        ) : null}
                    </div>
                </article>
            ))}

            {pendingQuestion ? (
                <div className="overflow-hidden rounded-[1.45rem] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(255,247,237,0.92))] shadow-[0_16px_36px_rgba(180,128,62,0.1)]">
                    <div className="border-b border-amber-100/90 px-4 py-3">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-amber-700">
                                你正在问
                            </span>
                            <p className="text-[15px] leading-7 text-stone-800">{pendingQuestion}</p>
                        </div>
                    </div>
                    <div className="px-4 py-4">
                        {pendingAnswer ? (
                            <TutorMarkdown content={pendingAnswer} className="text-[15px] text-stone-700" />
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-stone-500">
                                <Sparkles className="h-4 w-4 animate-spin text-amber-500" />
                                <span>老师正在组织答案...</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {!turns.length && !pendingQuestion && fallbackAnswer ? (
                <div className="rounded-[1.35rem] border border-stone-200/80 bg-white/85 p-4">
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        <BookOpenText className="h-3.5 w-3.5 text-amber-500" />
                        老师这样拆给你
                    </div>
                    <TutorMarkdown content={fallbackAnswer} className="text-sm text-stone-700" />
                </div>
            ) : null}
        </div>
    );
}
