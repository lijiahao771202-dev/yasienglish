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
        <div className={cn("prose prose-sm max-w-none text-inherit leading-7 prose-p:my-2 prose-ol:my-2 prose-ol:space-y-1.5 prose-ul:my-2 prose-ul:space-y-1.5 prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                    h1: ({ children }) => <h1 className="text-[17px] font-black text-stone-800 tracking-tight">{children}</h1>,
                    h2: ({ children }) => (
                        <h2 className="flex items-center gap-2 text-[15px] font-bold text-stone-800">
                            <span className="block h-3.5 w-1.5 rounded-full bg-emerald-500"></span>
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => <h3 className="text-[14px] font-bold text-stone-700">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-[13px] font-bold text-stone-600 uppercase tracking-wider">{children}</h4>,
                    p: ({ children }) => <p className="my-2">{children}</p>,
                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-5 marker:font-bold marker:text-stone-400">{children}</ol>,
                    ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-5 marker:text-emerald-500">{children}</ul>,
                    li: ({ children }) => <li className="pl-0.5 leading-7">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="my-4 rounded-r-xl border-l-4 border-emerald-400 bg-emerald-50/40 px-4 py-2.5 text-[14px] leading-7 text-stone-700/90 italic shadow-sm">
                            {children}
                        </blockquote>
                    ),
                    table: ({ children }) => (
                        <div className="my-4 overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm ring-1 ring-black/[0.02]">
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-left text-[14px] leading-6">
                                    {children}
                                </table>
                            </div>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-stone-50 border-b border-stone-200/80">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-stone-100">{children}</tbody>,
                    tr: ({ children }) => <tr className="align-top hover:bg-stone-50/50 transition-colors">{children}</tr>,
                    th: ({ children }) => (
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-stone-500">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => <td className="px-4 py-3 text-[13.5px] text-stone-700">{children}</td>,
                    strong: ({ children }) => (
                        <strong className="font-extrabold text-stone-900 bg-stone-100/80 px-1 py-0.5 rounded-[4px] shadow-[inset_0_-2px_0_rgba(16,185,129,0.2)]">
                            {children}
                        </strong>
                    ),
                    u: ({ children }) => (
                        <u className="decoration-emerald-400/80 decoration-[2px] underline-offset-[3px] text-stone-800 font-medium">
                            {children}
                        </u>
                    ),
                    ins: ({ children }) => (
                        <ins className="decoration-emerald-400/80 decoration-[2px] underline-offset-[3px] text-stone-800 font-medium no-underline">
                            {children}
                        </ins>
                    ),
                    mark: ({ children }) => (
                        <mark className="rounded-[4px] bg-emerald-100/80 px-1 py-0.5 text-emerald-900 font-medium">
                            {children}
                        </mark>
                    ),
                    hr: () => <hr className="my-6 border-0 border-t border-dashed border-stone-200" />,
                    code: ({ children, className: codeClassName, ...props }) => {
                        const isInline = !String(codeClassName || "").includes("language-");
                        if (isInline) {
                            return (
                                <code className="rounded-[4px] border border-stone-200/60 bg-stone-100/80 px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-emerald-700 shadow-sm">
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <div className="relative my-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-sm">
                                <div className="absolute top-0 left-0 w-full h-7 bg-stone-100/80 border-b border-stone-200 flex items-center px-3">
                                    <div className="flex gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-stone-300"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-stone-300"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-stone-300"></div>
                                    </div>
                                </div>
                                <div className="p-4 pt-10 overflow-x-auto text-[13px] leading-6">
                                    <code className={cn("font-mono text-stone-800", codeClassName)} {...props}>
                                        {children}
                                    </code>
                                </div>
                            </div>
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

    // Compact single-card style
    const renderCompactTurn = (question: string, answerNode: React.ReactNode, examples?: any[], fullAnswerObj?: any) => (
        <div className="overflow-hidden rounded-[1.25rem] border border-stone-200/70 bg-white shadow-[0_8px_20px_rgba(20,40,40,0.03)] ring-1 ring-black/[0.02]">
            {/* Question Header */}
            <div className="flex items-start gap-2.5 border-b border-stone-100 bg-stone-50/80 px-4 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-200/80 text-[9px] font-bold tracking-widest text-stone-600 shadow-inner">
                    YOU
                </span>
                <p className="text-[13.5px] font-medium leading-6 text-stone-700">{question}</p>
            </div>
            
            {/* Answer Body */}
            <div className="px-4 py-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                    <Sparkles className="h-3.5 w-3.5" />
                    老师
                </div>
                {answerNode}
                
                {examples?.length ? (
                    <TutorExamples examples={examples} onPlayCardAudio={onPlayCardAudio} compact />
                ) : null}

                {fullAnswerObj?.answer_revealed && fullAnswerObj?.full_answer && (
                    <section className="mt-3 rounded-[0.85rem] border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold text-emerald-700">参考表达</p>
                            <PlayCardButton text={fullAnswerObj.full_answer} onPlay={onPlayCardAudio} />
                        </div>
                        <p className="mt-1.5 break-words text-[14px] leading-6 text-stone-800 font-medium">{fullAnswerObj.full_answer}</p>
                        {fullAnswerObj.answer_reason_cn && (
                            <p className="mt-1.5 text-xs leading-5 text-stone-600">{fullAnswerObj.answer_reason_cn}</p>
                        )}
                    </section>
                )}
            </div>
        </div>
    );

    return (
        <div className={cn("space-y-4", isCompact && "space-y-3.5")}>
            {turns.map((turn, index) => (
                <article key={`${turn.question}-${index}`}>
                    {isCompact ? (
                        renderCompactTurn(
                            turn.question,
                            <TutorMarkdown content={turn.coach_markdown} className="text-[14px] leading-7 text-stone-800" />,
                            turn.example_sentences,
                            turn
                        )
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
                    renderCompactTurn(
                        pendingQuestion,
                        pendingAnswer ? (
                            <TutorMarkdown content={pendingAnswer} className="text-[14px] leading-7 text-stone-800" />
                        ) : (
                            <div className="my-1 flex items-center gap-2 text-[13px] font-medium text-stone-500">
                                <Sparkles className="h-4 w-4 animate-spin text-emerald-500" />
                                <span>老师正在思考...</span>
                            </div>
                        )
                    )
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
                    "rounded-[1.35rem] border p-4",
                    isCompact ? "border-stone-200/70 bg-white shadow-sm ring-1 ring-black/[0.02]" : "border-stone-200/80 bg-white/85"
                )}>
                    <div className={cn(
                        "mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600",
                        !isCompact && "uppercase tracking-[0.18em] text-stone-400"
                    )}>
                        <Sparkles className={cn("h-3.5 w-3.5", !isCompact && "text-fuchsia-500")} />
                        {isCompact ? "老师" : "老师这样拆给你"}
                    </div>
                    <TutorMarkdown content={fallbackAnswer} className={cn("text-stone-800", isCompact ? "text-[14px] leading-7" : "text-sm text-stone-700")} />
                </div>
            ) : null}
        </div>
    );
}
