import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

interface GrammarMarkdownProps {
    content: string;
    className?: string;
}

export function GrammarMarkdown({ content, className }: GrammarMarkdownProps) {
    const components = {
        h1: ({ children }: { children?: ReactNode }) => (
            <h1 className="my-2 text-[13px] font-black tracking-tight text-stone-900">{children}</h1>
        ),
        h2: ({ children }: { children?: ReactNode }) => (
            <h2 className="my-2 text-[12px] font-bold tracking-tight text-stone-900">{children}</h2>
        ),
        h3: ({ children }: { children?: ReactNode }) => (
            <h3 className="my-1.5 text-[12px] font-bold text-stone-900">{children}</h3>
        ),
        h4: ({ children }: { children?: ReactNode }) => (
            <h4 className="my-1 text-[11px] font-bold text-stone-900/90">{children}</h4>
        ),
        p: ({ children }: { children?: ReactNode }) => (
            <p className="my-1.5 leading-6 text-stone-700 first:mt-0 last:mb-0">{children}</p>
        ),
        ul: ({ children }: { children?: ReactNode }) => (
            <ul className="my-1.5 list-disc space-y-1 pl-4 marker:text-stone-400 first:mt-0 last:mb-0">{children}</ul>
        ),
        ol: ({ children }: { children?: ReactNode }) => (
            <ol className="my-1.5 list-decimal space-y-1 pl-4 marker:text-stone-400 first:mt-0 last:mb-0">{children}</ol>
        ),
        li: ({ children }: { children?: ReactNode }) => (
            <li className="leading-6 text-stone-700 [&>p]:my-0.5 [&>ul]:mt-1 [&>ol]:mt-1">
                {children}
            </li>
        ),
        blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="my-2 rounded-lg border-l-2 border-amber-300/80 bg-amber-50/70 px-3 py-2 text-stone-700 [&>p]:my-0">
                {children}
            </blockquote>
        ),
        strong: ({ children }: { children?: ReactNode }) => (
            <strong className="font-semibold text-stone-950">{children}</strong>
        ),
        em: ({ children }: { children?: ReactNode }) => (
            <em className="italic text-stone-700">{children}</em>
        ),
        a: ({ children }: { children?: ReactNode }) => (
            <span className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2">
                {children}
            </span>
        ),
        code: ({ children }: { children?: ReactNode }) => (
            <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] font-medium text-stone-800">
                {children}
            </code>
        ),
        pre: ({ children }: { children?: ReactNode }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-5 text-stone-700">
                {children}
            </pre>
        ),
        hr: () => <hr className="my-3 border-0 border-t border-stone-200" />,
    };

    return (
        <div className={cn("grammar-markdown text-[12px] leading-6", className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </ReactMarkdown>
        </div>
    );
}
