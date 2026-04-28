"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import { cn } from "@/lib/utils";
import { MindElixirDiagram } from "./MindElixirDiagram";
import { MermaidDiagram } from "./MermaidDiagram";

function isMarkdownHorizontalRule(line: string) {
    return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function withSectionDividers(content: string) {
    const lines = content.split("\n");
    const nextLines: string[] = [];
    let inFence = false;
    let seenSectionHeading = false;

    lines.forEach((line) => {
        if (/^\s{0,3}(```|~~~)/.test(line)) {
            inFence = !inFence;
            nextLines.push(line);
            return;
        }

        const isSectionHeading = !inFence && /^\s{0,3}##\s+\S/.test(line);
        if (isSectionHeading) {
            const previousMeaningfulLine = [...nextLines].reverse().find((candidate) => candidate.trim().length > 0);
            if (seenSectionHeading && previousMeaningfulLine && !isMarkdownHorizontalRule(previousMeaningfulLine)) {
                if (nextLines.at(-1)?.trim()) {
                    nextLines.push("");
                }
                nextLines.push("---", "");
            }
            seenSectionHeading = true;
        }

        nextLines.push(line);
    });

    return nextLines.join("\n");
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function withMarkSyntax(content: string) {
    const lines = content.split("\n");
    let inFence = false;

    return lines
        .map((line) => {
            if (/^\s{0,3}(```|~~~)/.test(line)) {
                inFence = !inFence;
                return line;
            }
            if (inFence || !line.includes("==")) {
                return line;
            }

            const segments = line.split(/(`[^`]*`)/g);
            return segments
                .map((segment) => {
                    if (segment.startsWith("`") && segment.endsWith("`")) {
                        return segment;
                    }
                    return segment.replace(/==([^=\n][^=\n]*?)==/g, (_, markedText: string) => (
                        `<mark>${escapeHtml(markedText)}</mark>`
                    ));
                })
                .join("");
        })
        .join("\n");
}

function withListTitleMarksAsBold(content: string) {
    return content
        .split("\n")
        .map((line) => line.replace(
            /^(\s*\d+\.\s*)<mark>([^<\n]+)<\/mark>(.*)$/,
            (_, prefix: string, title: string, suffix: string) => `${prefix}**${title}**${suffix}`,
        ))
        .join("\n");
}

function ExpandableTable({ children }: { children: ReactNode }) {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    useEffect(() => {
        if (!isLightboxOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsLightboxOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isLightboxOpen]);

    const lightbox = isLightboxOpen && typeof document !== "undefined"
        ? createPortal(
            <div
                data-testid="table-lightbox"
                className="fixed inset-0 z-[11000] bg-stone-950/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
                onClick={() => setIsLightboxOpen(false)}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="放大查看表格"
                    className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-stone-500">Table</p>
                            <p className="mt-1 text-[15px] font-bold text-stone-800">放大查看表格</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                            aria-label="关闭放大表格"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto bg-stone-50 px-3 py-4 sm:px-5 sm:py-5">
                        <div className="min-w-[720px] overflow-hidden rounded-[1.25rem] border border-stone-200/80 bg-white shadow-sm ring-1 ring-black/[0.02]">
                            <div className="overflow-x-auto">
                                <table className="min-w-[720px] table-fixed border-collapse text-left text-[14px] leading-7">
                                    {children}
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    return (
        <>
            <div
                className="group my-4 overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm ring-1 ring-black/[0.02] transition hover:shadow-md"
                role="button"
                tabIndex={0}
                aria-label="放大表格"
                onClick={() => setIsLightboxOpen(true)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setIsLightboxOpen(true);
                    }
                }}
                >
                <div className="flex items-center justify-end border-b border-stone-200/80 px-3 py-2">
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsLightboxOpen(true);
                        }}
                        aria-label="放大表格"
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                        放大
                    </button>
                </div>
                <div className="cursor-zoom-in overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-left text-[13px] leading-6">
                        {children}
                    </table>
                </div>
            </div>
            {lightbox}
        </>
    );
}

export function AiRichMarkdown({ content, className }: { content: string; className?: string }) {
    const contentWithSectionDividers = withSectionDividers(withListTitleMarksAsBold(withMarkSyntax(content)));

    return (
        <div className={cn("prose prose-sm max-w-none text-inherit leading-relaxed prose-p:my-2 prose-ol:my-3 prose-ol:space-y-2 prose-ul:my-3 prose-ul:space-y-1.5 marker:text-stone-400", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                    h1: ({ children }) => <h1 className="mb-3 mt-5 text-[16px] font-black tracking-tight text-indigo-900">{children}</h1>,
                    h2: ({ children }) => <h2 className="mb-3 mt-5 text-[15px] font-extrabold text-indigo-800">{children}</h2>,
                    h3: ({ children }) => <h3 className="mb-2 mt-4 text-[14px] font-bold text-emerald-800">{children}</h3>,
                    h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-[13px] font-bold text-amber-800">{children}</h4>,
                    p: ({ children }) => <p className="my-2 leading-7 text-stone-700">{children}</p>,
                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6 marker:font-bold marker:text-indigo-500">{children}</ol>,
                    ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-stone-400">{children}</ul>,
                    li: ({ children }) => (
                        <li className="my-1 leading-7 text-stone-700 [&>p]:my-1 [&>ul]:mb-0 [&>ul]:mt-1.5">
                            {children}
                        </li>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="my-3 rounded-r-xl border-l-4 border-indigo-400 bg-indigo-50/50 px-4 py-2.5 text-indigo-900 shadow-sm [&>p]:m-0">
                            {children}
                        </blockquote>
                    ),
                    table: ({ children }) => <ExpandableTable>{children}</ExpandableTable>,
                    thead: ({ children }) => <thead className="border-b border-stone-200/80 bg-stone-50">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-stone-100">{children}</tbody>,
                    tr: ({ children }) => <tr className="align-top transition-colors hover:bg-stone-50/50">{children}</tr>,
                    th: ({ children }) => (
                        <th className="whitespace-normal break-words border-b border-stone-200/70 bg-stone-50/70 px-3 py-2.5 text-[11px] font-bold text-stone-500 align-top">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="whitespace-normal break-words px-3 py-3 align-top text-[13px] text-stone-700 [overflow-wrap:anywhere] [word-break:normal]">
                            {children}
                        </td>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-bold text-stone-950">
                            {children}
                        </strong>
                    ),
                    u: ({ children }) => (
                        <u className="decoration-[#f2c94c]/80 decoration-[2px] underline-offset-[3px] text-stone-800 font-medium">
                            {children}
                        </u>
                    ),
                    ins: ({ children }) => (
                        <ins className="decoration-[#f2c94c]/80 decoration-[2px] underline-offset-[3px] text-stone-800 font-medium no-underline">
                            {children}
                        </ins>
                    ),
                    mark: ({ children }) => (
                        <mark className="box-decoration-clone rounded-[0.22em] bg-[linear-gradient(100deg,rgba(219,234,254,0)_0%,rgba(191,219,254,0.34)_8%,rgba(147,197,253,0.42)_52%,rgba(191,219,254,0.3)_94%,rgba(219,234,254,0)_100%)] px-1 py-[0.03em] font-semibold text-slate-900 shadow-[inset_0_-0.14em_0_rgba(96,165,250,0.16)]">
                            {children}
                        </mark>
                    ),
                    hr: () => <hr className="my-6 border-0 border-t border-stone-300/70" />,
                    code: ({ children, className: codeClassName, ...props }) => {
                        const language = String(codeClassName || "").replace(/^language-/, "");
                        const codeText = String(children).replace(/\n$/, "");
                        const isInline = !language;

                        if (isInline) {
                            return (
                                <code className="rounded-md border border-stone-200/60 bg-stone-100/80 px-1.5 py-0.5 text-[0.9em] font-medium text-pink-600">
                                    {children}
                                </code>
                            );
                        }

                        if (language === "mindmap" || language === "mind-elixir") {
                            return <MindElixirDiagram outline={codeText} />;
                        }

                        if (language === "mermaid") {
                            return <MermaidDiagram chart={codeText} />;
                        }

                        return (
                            <div className="my-3 overflow-hidden rounded-xl border border-stone-200/60 shadow-sm">
                                <div className="bg-stone-100/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                    {language}
                                </div>
                                <code className={cn("block overflow-x-auto bg-stone-50 p-3 text-[12px] leading-relaxed text-stone-800", codeClassName)} {...props}>
                                    {children}
                                </code>
                            </div>
                        );
                    },
                }}
            >
                {contentWithSectionDividers}
            </ReactMarkdown>
        </div>
    );
}
