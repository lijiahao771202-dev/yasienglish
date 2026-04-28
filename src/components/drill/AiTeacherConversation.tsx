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
    memory_resonance?: boolean;
    vocab_inception?: boolean;
}

export function ChalkboardUI({ content }: { content: string }) {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const extract = (keys: string[]) => {
        for (const key of keys) {
            const line = lines.find(l => l.startsWith(key));
            if (line) return line.replace(key, '').trim().replace(/\]$/, '').trim();
        }
        return '';
    };

    const formula = extract(['公式:', 'Formula:']);
    const structure = extract(['结构:', 'Structure:']);
    const meaning = extract(['释义:', 'Meaning:', '意思:']);

    // Fallback to raw pre if not matching expected structure
    if (!formula && !structure && !meaning) {
        return (
            <div className="relative my-6 overflow-hidden rounded-[1.25rem] bg-[#1a1816] shadow-2xl ring-1 ring-white/10">
                <div className="relative flex w-full items-center gap-2 border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-2.5 z-10">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400/80">
                        语法黑板 / Blackboard
                    </span>
                </div>
                <div className="p-5 z-10">
                    <pre className="font-mono text-[14px] leading-[2.1] text-amber-50/95 whitespace-pre-wrap break-words font-medium">
                        {content}
                    </pre>
                </div>
            </div>
        );
    }

    const partsString = structure || formula;
    let structureBlocks: { label: string; value: string | null }[] = [];
    
    if (partsString) {
        structureBlocks = partsString.split('+').map(part => {
            const p = part.trim().replace(/\.$/, ''); // clean trailing periods
            const match = p.match(/^(.*?)\s*[\(（](.*?)[\)）]$/);
            if (match) {
                return { label: match[1].trim(), value: match[2].trim() };
            }
            return { label: p, value: null };
        });
    }

    const getColorForLabel = (label: string) => {
        const l = label.toLowerCase();
        if (l.includes('主语') || l.includes('subject')) return 'bg-blue-500/10 text-blue-300 border-blue-500/20 shadow-[inset_0_1px_0_rgba(59,130,246,0.2)]';
        if (l.includes('谓语') || l.includes('动词') || l.includes('verb')) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-[inset_0_1px_0_rgba(16,185,129,0.2)]';
        if (l.includes('宾语') || l.includes('object')) return 'bg-rose-500/10 text-rose-300 border-rose-500/20 shadow-[inset_0_1px_0_rgba(244,63,94,0.2)]';
        if (l.includes('定语') || l.includes('状语') || l.includes('时间') || l.includes('地点') || l.includes('adverb')) return 'bg-amber-500/10 text-amber-300 border-amber-500/20 shadow-[inset_0_1px_0_rgba(245,158,11,0.2)]';
        if (l.includes('补语') || l.includes('表语') || l.includes('complement')) return 'bg-purple-500/10 text-purple-300 border-purple-500/20 shadow-[inset_0_1px_0_rgba(168,85,247,0.2)]';
        return 'bg-stone-500/10 text-stone-300 border-stone-500/20 shadow-[inset_0_1px_0_rgba(120,113,108,0.2)]';
    };

    return (
        <div className="relative my-6 overflow-hidden rounded-[1.25rem] bg-[#171513] shadow-2xl ring-1 ring-white/10 group">
            {/* Header / Top Bar */}
            <div className="relative flex w-full items-center gap-2 border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-2.5 z-10">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400/80">
                    语法高亮拆解 / Formula
                </span>
            </div>
            
            <div className="relative p-5 z-10 flex flex-col gap-5">
                {/* Lego Blocks Rendering */}
                {structureBlocks.length > 0 && (
                    <div className="flex flex-wrap items-stretch gap-2.5">
                        {structureBlocks.map((block, i) => (
                            <React.Fragment key={i}>
                                <div className={cn(
                                    "flex flex-col flex-1 min-w-[70px] rounded-[0.85rem] border p-2.5 shadow-md backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
                                    getColorForLabel(block.label)
                                )}>
                                    <span className="text-[10.5px] font-bold uppercase tracking-wider opacity-80 mb-1.5">{block.label}</span>
                                    {block.value ? (
                                        <span className="font-mono text-[14px] font-black text-white drop-shadow-sm tracking-tight">{block.value}</span>
                                    ) : (
                                        <span className="font-mono text-[14px] font-black tracking-tight text-white/50">-</span>
                                    )}
                                </div>
                                {i < structureBlocks.length - 1 && (
                                    <div className="flex items-center justify-center text-stone-600/50 font-black px-0.5 opacity-50">+</div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                )}
                
                {/* Raw Formula String if no splitting occurred */}
                {formula && structureBlocks.length <= 1 && (
                    <div className="font-mono text-[15px] font-bold text-amber-50 tracking-tight bg-white/[0.03] p-3 rounded-lg border border-white/5">
                        {formula}
                    </div>
                )}

                {/* Meaning / Explanation underneath */}
                {meaning && (
                    <div className="pt-4 mt-1 border-t border-white/[0.06]">
                        <div className="flex items-start gap-2.5">
                            <span className="shrink-0 mt-0.5 rounded text-[9.5px] font-black tracking-widest text-amber-500/90 uppercase border border-amber-500/30 px-1.5 py-0.5 bg-amber-500/10 shadow-sm">
                                释义
                            </span>
                            <p className="text-[14px] leading-[1.8] text-stone-300/95 font-medium">{meaning}</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Background Effects */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.02),transparent_60%)]" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-black/30 to-transparent" />
        </div>
    );
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
                        
                        if (String(codeClassName).includes("language-chalkboard")) {
                            return <ChalkboardUI content={String(children).replace(/\n$/, "")} />;
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
        <div className={cn(
            "relative overflow-hidden rounded-[1.25rem] border bg-white shadow-[0_8px_20px_rgba(20,40,40,0.03)] ring-1 ring-black/[0.02] transition-colors",
            fullAnswerObj?.memory_resonance ? "border-purple-300/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "border-stone-200/70"
        )}>
            {fullAnswerObj?.memory_resonance && (
                <div className="absolute inset-0 pointer-events-none rounded-[1.25rem] bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.08),transparent_50%)] animate-pulse" />
            )}
            
            {/* Question Header */}
            <div className={cn(
                "flex items-start gap-2.5 border-b px-4 py-3 relative z-10",
                fullAnswerObj?.memory_resonance ? "border-purple-100 bg-purple-50/50" : "border-stone-100 bg-stone-50/80"
            )}>
                <span className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tracking-widest shadow-inner",
                    fullAnswerObj?.memory_resonance ? "bg-purple-200/80 text-purple-700" : "bg-stone-200/80 text-stone-600"
                )}>
                    YOU
                </span>
                <p className={cn(
                    "text-[13.5px] font-medium leading-6",
                    fullAnswerObj?.memory_resonance ? "text-purple-900" : "text-stone-700"
                )}>{question}</p>
                
                {fullAnswerObj?.memory_resonance && (
                    <div className="absolute top-2 right-3 rounded bg-purple-100/80 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-purple-600 shadow-sm border border-purple-200">
                        👁️ 触发昨日残响
                    </div>
                )}
            </div>
            
            {/* Answer Body */}
            <div className="px-4 py-3.5 relative z-10">
                <div className="mb-2 flex items-center justify-between gap-1.5 text-[11px] font-bold text-emerald-600">
                    <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        老师
                    </div>
                    {fullAnswerObj?.vocab_inception && (
                        <div className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-600 border border-teal-100 shadow-sm flex items-center gap-1">
                            <span>✨ 生词联动</span>
                        </div>
                    )}
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
                        <div className={cn(
                            "relative overflow-hidden rounded-[1.55rem] border shadow-[0_18px_42px_rgba(148,113,78,0.08)]",
                            turn.memory_resonance 
                                ? "border-purple-300/70 bg-[linear-gradient(180deg,rgba(250,245,255,0.95),rgba(255,255,255,0.92))]"
                                : "border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(251,247,242,0.92))]"
                        )}>
                            {turn.memory_resonance && (
                                <div className="absolute inset-0 pointer-events-none rounded-[1.55rem] bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.1),transparent_50%)] animate-pulse" />
                            )}
                            <div className={cn(
                                "relative z-10 border-b px-4 py-3.5",
                                turn.memory_resonance 
                                    ? "border-purple-200/60 bg-[linear-gradient(180deg,rgba(243,232,255,0.85),rgba(255,255,255,0.68))]"
                                    : "border-stone-100/90 bg-[linear-gradient(180deg,rgba(255,247,251,0.85),rgba(255,255,255,0.68))]"
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <span className={cn(
                                            "mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] border",
                                            turn.memory_resonance
                                                ? "border-purple-300 bg-purple-100 text-purple-700"
                                                : "border-pink-200 bg-pink-50 text-pink-700"
                                        )}>
                                            你问
                                        </span>
                                        <p className="text-[15px] leading-7 text-stone-800">{turn.question}</p>
                                    </div>
                                    {turn.memory_resonance && (
                                        <div className="rounded-lg bg-white/80 p-1.5 shadow border border-purple-100 flex items-center gap-1.5 text-xs font-bold text-purple-600">
                                            <span>👁️ 触发昨日残响</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="relative z-10 space-y-3.5 px-4 py-4">
                                <div className={cn(
                                    "rounded-[1.2rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
                                    turn.memory_resonance 
                                        ? "border-purple-200/60 bg-white/95"
                                        : "border-stone-200/80 bg-white/92"
                                )}>
                                    <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                            老师这样拆给你
                                        </div>
                                        {turn.vocab_inception && (
                                            <div className="rounded font-sans tracking-normal bg-teal-50 px-2 py-0.5 text-[10px] text-teal-600 border border-teal-100 shadow-sm flex items-center">
                                                ✨ 生词联动
                                            </div>
                                        )}
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
