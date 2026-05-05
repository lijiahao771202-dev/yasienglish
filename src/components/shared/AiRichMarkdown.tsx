"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookPlus, Check, Loader2, Maximize2, X, Presentation } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import { cn } from "@/lib/utils";
import { MindElixirDiagram } from "./MindElixirDiagram";
import { MermaidDiagram } from "./MermaidDiagram";
import { SyntaxTreeView } from "@/components/reading/SyntaxTreeView";

export type InlineCodeVocabActionResult = "saved" | "exists";

interface AiRichMarkdownProps {
    content: string;
    className?: string;
    onInlineCodeVocabAction?: (text: string) => Promise<InlineCodeVocabActionResult>;
}

function isMarkdownHorizontalRule(line: string) {
    return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

interface SyntaxTreeData {
    label: string;
    text: string;
    zh?: string;
    role_zh?: string;
    zh_order?: number;
    children?: SyntaxTreeData[];
}

interface SyntaxTreeExtraction {
    cleanedContent: string;
    tree: SyntaxTreeData | null;
    pending: boolean;
}

const SYNTAX_TREE_CLOSED_FENCE = /```syntax-tree[^\n]*\n([\s\S]*?)\n```/;
const SYNTAX_TREE_OPEN_FENCE = /```syntax-tree[^\n]*\n([\s\S]*)$/;

const SYNTAX_TREE_MAX_DEPTH = 2; // root is depth 0; cap at depth 2 -> 3 levels total
const SYNTAX_TREE_MAX_CHILDREN = 6;

function normalizeSyntaxTreeNode(raw: unknown, depth = 0): SyntaxTreeData | null {
    if (!raw || typeof raw !== "object") return null;
    const node = raw as { label?: unknown; text?: unknown; zh?: unknown; role_zh?: unknown; zh_order?: unknown; children?: unknown };
    const label = typeof node.label === "string" ? node.label.trim() : "";
    const text = typeof node.text === "string" ? node.text : "";
    const zh = typeof node.zh === "string" ? node.zh.trim() : "";
    const roleZh = typeof node.role_zh === "string" ? node.role_zh.trim() : "";
    const zhOrder = typeof node.zh_order === "number" && Number.isFinite(node.zh_order) && node.zh_order > 0
        ? Math.floor(node.zh_order)
        : undefined;
    if (!label) return null;

    // At max depth, drop any further nesting the model produced.
    if (depth >= SYNTAX_TREE_MAX_DEPTH) {
        const leaf: SyntaxTreeData = { label, text };
        if (zh) leaf.zh = zh;
        if (roleZh) leaf.role_zh = roleZh;
        if (zhOrder !== undefined) leaf.zh_order = zhOrder;
        return leaf;
    }

    const childrenRaw = Array.isArray(node.children) ? node.children : [];
    const children = childrenRaw
        .slice(0, SYNTAX_TREE_MAX_CHILDREN)
        .map((child) => normalizeSyntaxTreeNode(child, depth + 1))
        .filter((child): child is SyntaxTreeData => Boolean(child));
    const normalized: SyntaxTreeData = { label, text };
    if (zh) normalized.zh = zh;
    if (roleZh) normalized.role_zh = roleZh;
    if (zhOrder !== undefined) normalized.zh_order = zhOrder;
    if (children.length > 0) normalized.children = children;
    return normalized;
}

function extractSyntaxTree(content: string): SyntaxTreeExtraction {
    const closedMatch = content.match(SYNTAX_TREE_CLOSED_FENCE);
    if (closedMatch) {
        const jsonText = closedMatch[1].trim();
        try {
            const parsed = JSON.parse(jsonText) as unknown;
            const normalized = normalizeSyntaxTreeNode(parsed);
            if (normalized) {
                const cleaned = (content.slice(0, closedMatch.index ?? 0)
                    + content.slice((closedMatch.index ?? 0) + closedMatch[0].length))
                    .replace(/^\s+/, "");
                return { cleanedContent: cleaned, tree: normalized, pending: false };
            }
        } catch {
            // Fall through so the fence keeps rendering as a plain code block for debugging.
        }
        return { cleanedContent: content, tree: null, pending: false };
    }

    const openMatch = content.match(SYNTAX_TREE_OPEN_FENCE);
    if (openMatch && typeof openMatch.index === "number") {
        const before = content.slice(0, openMatch.index).replace(/\s+$/, "");
        return { cleanedContent: before, tree: null, pending: true };
    }

    return { cleanedContent: content, tree: null, pending: false };
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

export function AiRichMarkdown({ content, className, onInlineCodeVocabAction }: AiRichMarkdownProps) {
    const { cleanedContent, tree: syntaxTree, pending: syntaxTreePending } = useMemo(
        () => extractSyntaxTree(content),
        [content],
    );
    const contentWithSectionDividers = withSectionDividers(
        withListTitleMarksAsBold(withMarkSyntax(cleanedContent)),
    );
    const [activeInlineCode, setActiveInlineCode] = useState<string | null>(null);
    const [inlineCodeStatus, setInlineCodeStatus] = useState<"idle" | "saving" | "saved" | "exists" | "error">("idle");
    const [isCoachLightboxOpen, setIsCoachLightboxOpen] = useState(false);

    useEffect(() => {
        if (!isCoachLightboxOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsCoachLightboxOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isCoachLightboxOpen]);

    useEffect(() => {
        if (!activeInlineCode) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("[data-ai-inline-code-popover]")) return;
            setActiveInlineCode(null);
            setInlineCodeStatus("idle");
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [activeInlineCode]);

    const handleInlineCodeVocabAction = async (text: string) => {
        if (!onInlineCodeVocabAction || inlineCodeStatus === "saving") return;
        setInlineCodeStatus("saving");
        try {
            const result = await onInlineCodeVocabAction(text);
            setInlineCodeStatus(result === "exists" ? "exists" : "saved");
        } catch (error) {
            console.error("Failed to save inline code vocab:", error);
            setInlineCodeStatus("error");
        }
    };

    const isSentenceCoach = Boolean(syntaxTree) || syntaxTreePending;

    const markdownComponents = {
        h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-3 mt-5 text-[16px] font-black tracking-tight text-indigo-900">{children}</h1>,
        h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-3 mt-5 text-[15px] font-extrabold text-indigo-800">{children}</h2>,
        h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-2 mt-4 text-[14px] font-bold text-emerald-800">{children}</h3>,
        h4: ({ children }: { children?: ReactNode }) => <h4 className="mb-1.5 mt-3 text-[13px] font-bold text-amber-800">{children}</h4>,
        p: ({ children }: { children?: ReactNode }) => <p className="my-2 leading-7 text-stone-700">{children}</p>,
        ol: ({ children }: { children?: ReactNode }) => <ol className="my-3 list-decimal space-y-2 pl-6 marker:font-bold marker:text-indigo-500">{children}</ol>,
        ul: ({ children }: { children?: ReactNode }) => <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-stone-400">{children}</ul>,
        li: ({ children }: { children?: ReactNode }) => (
            <li className="my-1 leading-7 text-stone-700 [&>p]:my-1 [&>ul]:mb-0 [&>ul]:mt-1.5">
                {children}
            </li>
        ),
        blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="my-3 rounded-r-xl border-l-4 border-indigo-400 bg-indigo-50/50 px-4 py-2.5 text-indigo-900 shadow-sm [&>p]:m-0">
                {children}
            </blockquote>
        ),
        table: ({ children }: { children?: ReactNode }) => <ExpandableTable>{children}</ExpandableTable>,
        thead: ({ children }: { children?: ReactNode }) => <thead className="border-b border-stone-200/80 bg-stone-50">{children}</thead>,
        tbody: ({ children }: { children?: ReactNode }) => <tbody className="divide-y divide-stone-100">{children}</tbody>,
        tr: ({ children }: { children?: ReactNode }) => <tr className="align-top transition-colors hover:bg-stone-50/50">{children}</tr>,
        th: ({ children }: { children?: ReactNode }) => (
            <th className="whitespace-normal break-words border-b border-stone-200/70 bg-stone-50/70 px-3 py-2.5 text-[11px] font-bold text-stone-500 align-top">
                {children}
            </th>
        ),
        td: ({ children }: { children?: ReactNode }) => (
            <td className="whitespace-normal break-words px-3 py-3 align-top text-[13px] text-stone-700 [overflow-wrap:anywhere] [word-break:normal]">
                {children}
            </td>
        ),
        strong: ({ children }: { children?: ReactNode }) => (
            <strong className="font-bold text-stone-950">
                {children}
            </strong>
        ),
        u: ({ children }: { children?: ReactNode }) => (
            <u className="decoration-[#f2c94c]/80 decoration-[2px] underline-offset-[3px] text-stone-800 font-medium">
                {children}
            </u>
        ),
        ins: ({ children }: { children?: ReactNode }) => (
            <ins className="decoration-[#f2c94c]/80 decoration-[2px] underline-offset-[3px] text-stone-800 font-medium no-underline">
                {children}
            </ins>
        ),
        mark: ({ children }: { children?: ReactNode }) => (
            <mark className="box-decoration-clone rounded-[0.22em] bg-[linear-gradient(100deg,rgba(219,234,254,0)_0%,rgba(191,219,254,0.34)_8%,rgba(147,197,253,0.42)_52%,rgba(191,219,254,0.3)_94%,rgba(219,234,254,0)_100%)] px-1 py-[0.03em] font-semibold text-slate-900 shadow-[inset_0_-0.14em_0_rgba(96,165,250,0.16)]">
                {children}
            </mark>
        ),
        hr: () => <hr className="my-6 border-0 border-t border-stone-300/70" />,
        code: ({ children, className: codeClassName, ...props }: { children?: ReactNode; className?: string }) => {
            const language = String(codeClassName || "").replace(/^language-/, "");
            const codeText = String(children).replace(/\n$/, "");
            const isInline = !language;

            if (isInline) {
                if (onInlineCodeVocabAction) {
                    const isActive = activeInlineCode === codeText;
                    const isBusy = isActive && inlineCodeStatus === "saving";
                    const statusText = inlineCodeStatus === "exists"
                        ? "已在生词本"
                        : inlineCodeStatus === "saved"
                            ? "已加入"
                            : inlineCodeStatus === "error"
                                ? "保存失败"
                                : "加入生词本";

                    return (
                        <span
                            data-ai-inline-code-popover="true"
                            className="relative inline align-baseline"
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            <code
                                role="button"
                                tabIndex={0}
                                data-ai-inline-code-action="true"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setActiveInlineCode(isActive ? null : codeText);
                                    setInlineCodeStatus("idle");
                                }}
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter" && event.key !== " ") return;
                                    event.preventDefault();
                                    setActiveInlineCode(isActive ? null : codeText);
                                    setInlineCodeStatus("idle");
                                }}
                                className="text-[0.95em] font-medium text-pink-600"
                            >
                                {children}
                            </code>
                            {isActive ? (
                                <span className="absolute left-0 top-[calc(100%+0.35rem)] z-[12000] w-max max-w-[220px] rounded-2xl border border-stone-200/80 bg-white/95 p-2 text-left shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur-md">
                                    <span className="block max-w-[190px] truncate px-2 pb-1 text-[11px] font-semibold text-stone-500">
                                        {codeText}
                                    </span>
                                    <button
                                        type="button"
                                        data-ai-inline-code-add-vocab="true"
                                        disabled={isBusy || inlineCodeStatus === "saved" || inlineCodeStatus === "exists"}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            void handleInlineCodeVocabAction(codeText);
                                        }}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[12px] font-bold text-sky-700 transition hover:bg-sky-100 disabled:cursor-default disabled:bg-stone-50 disabled:text-stone-500"
                                    >
                                        {isBusy ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : inlineCodeStatus === "saved" || inlineCodeStatus === "exists" ? (
                                            <Check className="h-3.5 w-3.5" />
                                        ) : (
                                            <BookPlus className="h-3.5 w-3.5" />
                                        )}
                                        {statusText}
                                    </button>
                                </span>
                            ) : null}
                        </span>
                    );
                }

                return (
                    <code className="text-[0.95em] font-medium text-pink-600">
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

            if (language === "syntax-tree") {
                try {
                    const parsed = JSON.parse(codeText) as unknown;
                    const normalized = normalizeSyntaxTreeNode(parsed);
                    if (normalized) {
                        return (
                            <div className="not-prose my-3 overflow-hidden rounded-2xl border border-indigo-100/70 bg-white/80 shadow-[0_8px_24px_rgba(79,70,229,0.06)] backdrop-blur-sm">
                                <div className="flex items-center gap-2 border-b border-indigo-100/70 bg-gradient-to-r from-indigo-50/90 via-white/80 to-white px-4 py-2.5 text-indigo-700">
                                    <span aria-hidden className="text-[14px]">🌳</span>
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em]">句子结构</span>
                                </div>
                                <SyntaxTreeView data={normalized} allowFullscreen height={360} />
                            </div>
                        );
                    }
                } catch {
                    // fall through to raw rendering below
                }
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
    };

    // Render the chat view: syntax tree (if any) + markdown below it.
    // The fullscreen modal (Lightbox) is still available via the tree's "放大" button.
    return (
        <div className={cn("prose prose-sm max-w-none text-inherit leading-relaxed prose-p:my-2 prose-ol:my-3 prose-ol:space-y-2 prose-ul:my-3 prose-ul:space-y-1.5 marker:text-stone-400", className)}>
            {syntaxTree ? (
                <div className="not-prose mb-3 overflow-hidden rounded-2xl border border-indigo-100/70 bg-white/80 shadow-[0_8px_24px_rgba(79,70,229,0.06)] backdrop-blur-sm">
                    <div className="flex items-center gap-2 border-b border-indigo-100/70 bg-gradient-to-r from-indigo-50/90 via-white/80 to-white px-4 py-2.5 text-indigo-700">
                        <span aria-hidden className="text-[14px]">🌳</span>
                        <span className="text-[11px] font-black uppercase tracking-[0.18em]">句子结构</span>
                        <button
                            type="button"
                            onClick={() => setIsCoachLightboxOpen(true)}
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-indigo-600 transition hover:bg-white hover:text-indigo-800"
                            aria-label="全屏沉浸式解析"
                        >
                            <Maximize2 className="h-3 w-3" />
                            全屏解析
                        </button>
                    </div>
                    <SyntaxTreeView data={syntaxTree} allowFullscreen={false} height={360} />
                </div>
            ) : null}
            {syntaxTreePending ? (
                <div className="not-prose mb-3 flex items-center gap-2 rounded-2xl border border-indigo-100/70 bg-indigo-50/70 px-4 py-3 text-[12px] font-medium text-indigo-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在构建句子结构树…
                </div>
            ) : null}

            {/* If we are in SentenceCoach and they open the lightbox, render the full-screen report */}
            {isSentenceCoach && isCoachLightboxOpen && typeof document !== "undefined"
                ? createPortal(
                    <div className="fixed inset-0 z-[12000] flex flex-col bg-stone-950/70 backdrop-blur-md sm:p-4 md:p-6 lg:p-8">
                        <div className="flex w-full flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl lg:flex-row">
                            {/* Left Side: Infinite Canvas */}
                            <div className="relative flex min-h-[40vh] flex-col border-b border-stone-200/80 bg-stone-50/50 lg:w-[60%] lg:border-b-0 lg:border-r">
                                <div className="absolute left-0 right-0 top-0 z-10 flex h-14 items-center justify-between border-b border-stone-200/80 bg-white/60 px-5 backdrop-blur-md">
                                    <div className="flex items-center gap-2">
                                        <span aria-hidden className="text-[16px]">🌳</span>
                                        <span className="text-[12px] font-black uppercase tracking-[0.2em] text-stone-600">语法树</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden pt-14">
                                    {syntaxTree ? (
                                        <SyntaxTreeView data={syntaxTree} allowFullscreen={false} height="100%" minZoom={0.3} maxZoom={2} />
                                    ) : (
                                        <div className="flex h-full items-center justify-center gap-2 text-stone-500">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            <span className="text-[13px] font-semibold tracking-wide">AI 正在解剖长难句…</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Side: Markdown Report */}
                            <div className="flex flex-col bg-white lg:w-[40%]">
                                <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200/80 px-5 sm:px-6">
                                    <div className="flex items-center gap-2">
                                        <span aria-hidden className="text-[16px]">📑</span>
                                        <span className="text-[12px] font-black uppercase tracking-[0.2em] text-stone-600">深度解析</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsCoachLightboxOpen(false)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                                        aria-label="关闭解析"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
                                    <div className="prose prose-sm max-w-none text-inherit leading-relaxed prose-p:my-2 prose-ol:my-3 prose-ol:space-y-2 prose-ul:my-3 prose-ul:space-y-1.5 marker:text-stone-400">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeRaw]}
                                            components={markdownComponents}
                                        >
                                            {contentWithSectionDividers}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )
                : null}

            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents}
            >
                {contentWithSectionDividers}
            </ReactMarkdown>
        </div>
    );
}
