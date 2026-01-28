import { useState } from "react";
import { Newspaper, ChevronRight, ChevronLeft, FileText, BookOpen, Sword } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArticleItem } from "./RecommendedArticles";
import { useUserStore } from "@/lib/store";

interface ArticleSidebarProps {
    articles: ArticleItem[];
    currentUrl: string;
    onSelect: (url: string) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

export function ArticleSidebar({ articles, currentUrl, onSelect, isOpen, setIsOpen }: ArticleSidebarProps) {
    const { readArticleUrls } = useUserStore();

    return (
        <>
            {/* Toggle Button (Visible when closed) */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "fixed left-4 top-24 z-50 p-2 rounded-full glass-button transition-all duration-300",
                    isOpen ? "opacity-0 pointer-events-none" : "opacity-100"
                )}
            >
                <ChevronRight className="w-5 h-5 text-amber-600" />
            </button>

            {/* Sidebar Container */}
            <div
                className={cn(
                    "fixed left-0 top-0 h-full z-40 bg-white/70 backdrop-blur-2xl border-r border-stone-200/50 transition-all duration-500 ease-in-out flex flex-col shadow-2xl",
                    isOpen ? "w-80 translate-x-0" : "w-80 -translate-x-full"
                )}
            >
                {/* Header */}
                <div className="p-6 pt-24 flex justify-between items-center border-b border-stone-200/50">
                    <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                        <Newspaper className="w-5 h-5 text-amber-500" />
                        Related Articles
                    </h3>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation Links */}
                <div className="px-4 py-2 flex gap-2 border-b border-stone-200/50">
                    <a href="/vocab" className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-medium border border-emerald-100">
                        <BookOpen className="w-4 h-4" />
                        Vocabulary
                    </a>
                    <a href="/battle" className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-sm font-medium border border-indigo-100">
                        <Sword className="w-4 h-4" />
                        Battle
                    </a>
                </div>

                {/* Article List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {articles.map((item, i) => {
                        const isActive = currentUrl === item.link;
                        const isRead = readArticleUrls.includes(item.link);
                        return (
                            <div
                                key={i}
                                onClick={() => onSelect(item.link)}
                                className={cn(
                                    "p-3 rounded-lg cursor-pointer transition-all group border border-transparent",
                                    isActive
                                        ? "bg-amber-100 border-amber-200 glass-card-hover"
                                        : isRead
                                            ? "bg-stone-50 border-stone-100 hover:border-stone-200 opacity-60 hover:opacity-100"
                                            : "glass-card-hover hover:bg-white/50"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <FileText className={cn(
                                        "w-4 h-4 mt-1 flex-shrink-0",
                                        isActive
                                            ? "text-amber-600"
                                            : isRead
                                                ? "text-stone-300"
                                                : "text-stone-400 group-hover:text-amber-500"
                                    )} />
                                    <div className="space-y-1">
                                        <h4 className={cn(
                                            "text-sm font-medium line-clamp-2 leading-snug",
                                            isActive
                                                ? "text-amber-900"
                                                : isRead
                                                    ? "text-stone-400"
                                                    : "text-stone-600 group-hover:text-stone-900"
                                        )}>
                                            {item.title}
                                        </h4>
                                        <div className="flex justify-between items-center text-[10px] text-stone-400">
                                            <span>{item.source}</span>
                                            <span>{new Date(item.pubDate).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
