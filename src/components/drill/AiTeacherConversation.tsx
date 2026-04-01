"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { BookOpenText, Sparkles, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { PretextBubble } from "@/components/ui/PretextBubble";

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
    example_sentences?: Array<{
        label_cn?: string;
        sentence_en: string;
        sentence_en_tokens?: string[];
        note_cn?: string;
    }>;
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
        <div className={cn("prose prose-sm max-w-none text-inherit leading-7 prose-p:my-2 prose-ol:my-2 prose-ol:space-y-1.5 prose-ul:my-2 prose-ul:space-y-1 prose-headings:mb-1 prose-headings:mt-0", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                    h1: ({ children }) => <h1 className="text-base font-semibold text-fuchsia-700">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-[0.98rem] font-semibold text-fuchsia-700">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-fuchsia-700">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-sm font-medium text-rose-700">{children}</h4>,
                    p: ({ children }) => <p className="my-2 text-inherit">{children}</p>,
                    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-fuchsia-400">{children}</ol>,
                    ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 pl-4 marker:text-pink-300">{children}</ul>,
                    li: ({ children }) => <li className="my-0.5 leading-7">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="my-3 border-l-2 border-pink-200 pl-3 text-rose-700/85">
                            {children}
                        </blockquote>
                    ),
                    table: ({ children }) => (
                        <div className="my-4 overflow-hidden rounded-2xl border border-pink-200/90 bg-[linear-gradient(180deg,rgba(255,247,251,0.96),rgba(255,255,255,0.9))]">
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-left text-[14px] leading-6 text-stone-700">
                                    {children}
                                </table>
                            </div>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-[rgba(253,242,248,0.95)] text-rose-500">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-pink-200/70">{children}</tbody>,
                    tr: ({ children }) => <tr className="align-top">{children}</tr>,
                    th: ({ children }) => (
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => <td className="px-4 py-3 text-[14px] leading-6 text-stone-700">{children}</td>,
                    strong: ({ children }) => (
                        <strong className="font-semibold text-rose-700 decoration-pink-400/95 underline underline-offset-[3px]">
                            {children}
                        </strong>
                    ),
                    u: ({ children }) => (
                        <u className="decoration-fuchsia-400/90 decoration-[1.5px] underline underline-offset-[3px] text-rose-700">
                            {children}
                        </u>
                    ),
                    ins: ({ children }) => (
                        <ins className="decoration-fuchsia-400/90 decoration-[1.5px] underline underline-offset-[3px] text-rose-700">
                            {children}
                        </ins>
                    ),
                    mark: ({ children }) => (
                        <mark className="rounded bg-pink-100/90 px-1 py-0.5 text-rose-800 shadow-[inset_0_-1px_0_rgba(236,72,153,0.16)]">
                            {children}
                        </mark>
                    ),
                    hr: () => <hr className="my-5 border-0 border-t border-dashed border-pink-200" />,
                    code: ({ children, className: codeClassName, ...props }) => {
                        const isInline = !String(codeClassName || "").includes("language-");
                        if (isInline) {
                            return (
                                <code className="rounded bg-fuchsia-50 px-1 py-0.5 font-mono text-[0.95em] text-fuchsia-700">
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
    variant?: "default" | "compact";
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

function TutorExamples({
    examples,
    onPlayCardAudio,
    compact,
}: {
    examples: NonNullable<TutorStructuredResponse["example_sentences"]>;
    onPlayCardAudio: (text: string) => void;
    compact: boolean;
}) {
    if (!examples.length) return null;

    return (
        <section className={cn(
            "mt-3 rounded-[1.1rem] border border-fuchsia-100/90 bg-[linear-gradient(180deg,rgba(255,245,251,0.96),rgba(255,255,255,0.94))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
            compact && "mt-3"
        )}>
            <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold text-fuchsia-700">
                <BookOpenText className="h-3.5 w-3.5 text-fuchsia-500" />
                结构化例句
            </div>
            <div className="space-y-2.5">
                {examples.map((example, index) => (
                    <div key={`${example.sentence_en}-${index}`} className="rounded-[1rem] border border-white/80 bg-white/78 px-3.5 py-3 shadow-[0_8px_20px_rgba(244,114,182,0.05)]">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold text-rose-500">
                                {example.label_cn || `例句 ${index + 1}`}
                            </p>
                            <PlayCardButton text={example.sentence_en} onPlay={onPlayCardAudio} />
                        </div>
                        <p className="mt-1.5 break-words text-[15px] leading-7 text-stone-800">{example.sentence_en}</p>
                        {example.note_cn ? (
                            <p className="mt-1.5 text-xs leading-5 text-stone-600">{example.note_cn}</p>
                        ) : null}
                    </div>
                ))}
            </div>
        </section>
    );
}


export function AiTeacherConversation({
    turns,
    pendingQuestion,
    pendingAnswer,
    fallbackAnswer,
    onPlayCardAudio,
    variant = "default",
}: AiTeacherConversationProps) {
    const isCompact = variant === "compact";
    const compactQuestionBubbleClass =
        "max-w-[82%] rounded-[1.35rem] border border-fuchsia-100/90 bg-[linear-gradient(135deg,rgba(255,244,252,0.96),rgba(252,231,243,0.92))] px-4 py-3 text-sm leading-6 text-stone-800 shadow-[0_10px_28px_rgba(236,72,153,0.10)] ring-1 ring-white/70 backdrop-blur-sm";
    const compactAnswerBubbleClass =
        "rounded-[1.45rem] border border-pink-100/90 bg-[linear-gradient(180deg,rgba(255,251,253,0.98),rgba(255,246,251,0.92))] px-4 py-3.5 shadow-[0_14px_34px_rgba(244,114,182,0.08)] ring-1 ring-white/80";

    return (
        <div className={cn("space-y-4", isCompact && "space-y-3")}>
            {turns.map((turn, index) => (
                <article key={`${turn.question}-${index}`} className={cn(isCompact && "space-y-2.5")}>
                    {isCompact ? (
                        <>
                            <div className="flex justify-end">
                                <PretextBubble text={turn.question} maxWidthRatio={0.82} minWidthPx={118} className={compactQuestionBubbleClass}>
                                    <span className="mr-2 text-[11px] font-semibold text-fuchsia-600">你</span>
                                    {turn.question}
                                </PretextBubble>
                            </div>

                            <div className={compactAnswerBubbleClass}>
                                <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold text-fuchsia-700">
                                    <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
                                    老师
                                </div>
                                <TutorMarkdown content={turn.coach_markdown} className="text-[14px] leading-7 text-stone-700" />
                                {turn.example_sentences?.length ? (
                                    <TutorExamples examples={turn.example_sentences} onPlayCardAudio={onPlayCardAudio} compact />
                                ) : null}
                                {turn.answer_revealed && turn.full_answer ? (
                                    <section className="mt-3 rounded-[1.1rem] border border-fuchsia-100/90 bg-[linear-gradient(180deg,rgba(255,245,251,0.96),rgba(255,255,255,0.94))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-[11px] font-semibold text-fuchsia-700">参考表达</p>
                                            <PlayCardButton text={turn.full_answer} onPlay={onPlayCardAudio} />
                                        </div>
                                        <p className="mt-1.5 break-words text-[15px] leading-7 text-stone-800">{turn.full_answer}</p>
                                        {turn.answer_reason_cn ? (
                                            <p className="mt-1.5 text-xs leading-5 text-stone-600">{turn.answer_reason_cn}</p>
                                        ) : null}
                                    </section>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <div className="overflow-hidden rounded-[1.55rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(251,247,242,0.92))] shadow-[0_18px_42px_rgba(148,113,78,0.08)]">
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
                                    {turn.example_sentences?.length ? (
                                        <TutorExamples examples={turn.example_sentences} onPlayCardAudio={onPlayCardAudio} compact={false} />
                                    ) : null}
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
                        </div>
                    )}
                </article>
            ))}

            {pendingQuestion ? (
                isCompact ? (
                        <div className="space-y-3">
                            <div className="flex justify-end">
                                <PretextBubble text={pendingQuestion} maxWidthRatio={0.82} minWidthPx={118} className={compactQuestionBubbleClass}>
                                    <span className="mr-2 text-[11px] font-semibold text-fuchsia-600">你</span>
                                    {pendingQuestion}
                                </PretextBubble>
                            </div>
                            <div className={compactAnswerBubbleClass}>
                                <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold text-fuchsia-700">
                                    <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
                                    老师
                                </div>
                            {pendingAnswer ? (
                                <TutorMarkdown content={pendingAnswer} className="text-[14px] leading-7 text-stone-700" />
                            ) : (
                                <div className="flex items-center gap-2 text-sm text-stone-500">
                                    <Sparkles className="h-4 w-4 animate-spin text-fuchsia-500" />
                                    <span>老师正在思考...</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
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
                )
            ) : null}

            {!turns.length && !pendingQuestion && fallbackAnswer ? (
                <div className={cn(
                    "rounded-[1.35rem] border border-stone-200/80 bg-white/85 p-4",
                    isCompact && "rounded-[1.25rem] border-pink-100/90 bg-[linear-gradient(180deg,rgba(255,250,253,0.98),rgba(255,244,250,0.94))] shadow-[0_14px_34px_rgba(244,114,182,0.08)]"
                )}>
                    <div className={cn(
                        "mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400",
                        isCompact && "mb-2 normal-case tracking-normal text-fuchsia-700"
                    )}>
                        <BookOpenText className="h-3.5 w-3.5 text-fuchsia-500" />
                        {isCompact ? "老师" : "老师这样拆给你"}
                    </div>
                    <TutorMarkdown content={fallbackAnswer} className={cn("text-sm text-stone-700", isCompact && "text-[14px] leading-6")} />
                </div>
            ) : null}
        </div>
    );
}
