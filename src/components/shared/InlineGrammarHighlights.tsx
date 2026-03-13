import React from "react";
import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    buildGrammarHighlightSegments,
    getGrammarHighlightColor,
    locateGrammarSentenceMarkers,
    translateGrammarType,
    type GrammarSentenceAnalysis,
} from "@/lib/grammarHighlights";

interface InlineGrammarHighlightsProps {
    text: string;
    sentences: GrammarSentenceAnalysis[];
    className?: string;
    textClassName?: string;
    showSentenceMarkers?: boolean;
}

export function InlineGrammarHighlights({
    text,
    sentences,
    className,
    textClassName,
    showSentenceMarkers = false,
}: InlineGrammarHighlightsProps) {
    const segments = buildGrammarHighlightSegments(text, sentences);
    const sentenceMarkers = showSentenceMarkers ? locateGrammarSentenceMarkers(text, sentences) : [];

    return (
        <span className={cn("inline", textClassName, className)}>
            {segments.map((segment) => {
                const marker = sentenceMarkers.find((item) => item.start === segment.start);
                const content = segment.highlight ? (
                    <span
                        key={`${segment.start}-${segment.end}`}
                        className={cn(
                            "group/highlight relative cursor-help rounded-sm px-0.5 mx-0.5 transition-all duration-200",
                            getGrammarHighlightColor(segment.highlight.type),
                        )}
                    >
                        {segment.text}
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2 w-max max-w-[280px] -translate-x-1/2 translate-y-2 rounded-xl border border-white/60 bg-white/95 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition-all duration-200 ease-out group-hover/highlight:translate-y-0 group-hover/highlight:opacity-100">
                            <span className="flex items-center gap-1.5 border-b border-stone-100 bg-gradient-to-r from-stone-50 to-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-stone-600">
                                <BookOpen className="h-3 w-3 text-amber-500" />
                                {translateGrammarType(segment.highlight.type)}
                            </span>
                            <span className="block p-3 text-xs font-medium leading-relaxed text-stone-600">
                                {segment.highlight.explanation}
                            </span>
                            <span className="absolute left-1/2 top-full -mt-[1px] -translate-x-1/2 border-6 border-transparent border-t-white/95 drop-shadow-sm" />
                        </span>
                    </span>
                ) : (
                    <span key={`${segment.start}-${segment.end}`}>{segment.text}</span>
                );

                if (!marker) {
                    return content;
                }

                return (
                    <React.Fragment key={`fragment-${segment.start}-${segment.end}`}>
                        <span className="group/trans-icon relative mr-1 inline-block select-none align-middle">
                            <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-amber-200 bg-amber-100 text-[10px] font-bold text-amber-600 shadow-sm transition-all duration-300 hover:bg-amber-500 hover:text-white">
                                {sentenceMarkers.indexOf(marker) + 1}
                            </span>
                            {marker.translation ? (
                                <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-80 translate-y-2 rounded-xl border border-stone-200 bg-white/95 p-4 text-left opacity-0 shadow-xl transition-all duration-300 ease-out group-hover/trans-icon:translate-y-0 group-hover/trans-icon:opacity-100">
                                    <span className="mb-2 flex items-center justify-between border-b border-stone-100 pb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                                            第 {sentenceMarkers.indexOf(marker) + 1} 句
                                        </span>
                                        <span className="rounded-full bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                                            译文
                                        </span>
                                    </span>
                                    <span className="text-sm font-medium leading-relaxed text-stone-700">
                                        {marker.translation}
                                    </span>
                                </span>
                            ) : null}
                        </span>
                        {content}
                    </React.Fragment>
                );
            })}
        </span>
    );
}
