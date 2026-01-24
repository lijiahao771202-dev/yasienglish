"use client";

import { useEffect, useState } from "react";
import { Newspaper, Brain, ExternalLink, Loader2, BookOpen, GraduationCap, Cpu, Sparkles, Send, RefreshCw, Trash2, Check, LayoutGrid } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFeedStore } from "@/lib/feed-store";
import { useUserStore } from "@/lib/store";

export interface ArticleItem {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    snippet?: string;
    image?: string;
}

interface RecommendedArticlesProps {
    onSelect: (url: string) => void;
    onArticleLoaded?: (article: any) => void;
    onListUpdate?: (articles: ArticleItem[]) => void;
}

export function RecommendedArticles({ onSelect, onArticleLoaded, onListUpdate }: RecommendedArticlesProps) {
    const [articles, setArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<'news' | 'psychology' | 'ielts' | 'cet4' | 'cet6' | 'ai_news' | 'ai_gen' | 'ted'>('psychology');
    const [genTopic, setGenTopic] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

    const { feeds, setFeed, getFeed, loadFeedFromDB, deleteArticle } = useFeedStore();
    const { readArticleUrls, markArticleAsRead } = useUserStore();

    useEffect(() => {
        if (category === 'ai_gen') {
            setLoading(false);
            return;
        }

        // Try to load from DB first (which updates memory)
        loadFeedFromDB(category).then(() => {
            // Check global store (memory)
            const cachedFeeds = getFeed(category);
            if (cachedFeeds) {
                setArticles(cachedFeeds);
                setLoading(false);
                if (onListUpdate) {
                    onListUpdate(cachedFeeds);
                }
                return;
            }

            // If not in DB/memory, fetch from API
            const fetchFeed = async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/feed?category=${category}`);
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setArticles(data);
                        // Update global store & DB
                        setFeed(category, data);
                        if (onListUpdate) {
                            onListUpdate(data);
                        }
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    setLoading(false);
                }
            };

            fetchFeed();
        });
    }, [category, getFeed, setFeed, loadFeedFromDB]);

    const handleGenerate = async () => {
        if (!genTopic.trim()) return;
        setIsGenerating(true);
        try {
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: genTopic }),
            });
            const data = await res.json();
            if (onArticleLoaded) {
                onArticleLoaded(data);
            }
        } catch (error) {
            console.error("Generation error:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRefresh = async () => {
        setLoading(true);
        try {
            // Add timestamp to bypass cache
            const res = await fetch(`/api/feed?category=${category}&t=${Date.now()}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setArticles(data);
                // Update global store & DB
                setFeed(category, data);
                if (onListUpdate) {
                    onListUpdate(data);
                }
            }
        } catch (error) {
            console.error("Refresh error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, link: string) => {
        e.stopPropagation(); // Prevent card click
        if (confirm('Are you sure you want to remove this article?')) {
            await deleteArticle(category, link);
            setArticles(prev => prev.filter(a => a.link !== link));
        }
    };

    // Deterministic gradient generator
    const getGradient = (id: string) => {
        const gradients = [
            "bg-gradient-to-br from-rose-100 to-teal-100",
            "bg-gradient-to-br from-amber-100 to-lime-100",
            "bg-gradient-to-br from-cyan-100 to-fuchsia-100",
            "bg-gradient-to-br from-emerald-100 to-sky-100",
            "bg-gradient-to-br from-violet-100 to-rose-100",
            "bg-gradient-to-br from-orange-100 to-amber-100",
            "bg-gradient-to-br from-blue-100 to-indigo-100",
            "bg-gradient-to-br from-pink-100 to-rose-200",
            "bg-gradient-to-br from-lime-100 to-emerald-100",
            "bg-gradient-to-br from-sky-100 to-blue-200",
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return gradients[Math.abs(hash) % gradients.length];
    };

    return (
        <div className="w-full max-w-4xl animate-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col gap-4 mb-6">
                <h3 className="text-2xl font-bold font-newsreader text-stone-800 flex items-center gap-2">
                    {category === 'news' && <Newspaper className="w-5 h-5 text-blue-600" />}
                    {category === 'psychology' && <Brain className="w-5 h-5 text-purple-600" />}
                    {(category === 'ielts' || category === 'cet4' || category === 'cet6') && <GraduationCap className="w-5 h-5 text-amber-500" />}
                    {category === 'ai_news' && <Cpu className="w-5 h-5 text-indigo-600" />}
                    {category === 'ai_gen' && <Sparkles className="w-5 h-5 text-rose-500" />}
                    {category === 'ted' && <span className="w-5 h-5 flex items-center justify-center font-bold text-[10px] text-white bg-red-600 rounded">TED</span>}
                    Recommended Reading
                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className="ml-2 p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-50"
                        title={`Refresh ${category.replace('_', ' ')} articles`}
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </h3>

                <div className="flex flex-col items-center justify-center gap-6">
                    <div className="flex items-center gap-2 p-1.5 bg-stone-200/40 backdrop-blur-xl rounded-full border border-white/20 shadow-inner overflow-x-auto max-w-full scrollbar-hide">
                        {[
                            { id: 'psychology', label: 'Psychology' },
                            { id: 'news', label: 'Global News' },
                            { id: 'ai_news', label: 'AI News' },
                            { id: 'ielts', label: 'IELTS' },
                            { id: 'cet4', label: 'CET-4' },
                            { id: 'cet6', label: 'CET-6' },
                            { id: 'ai_gen', label: 'AI Gen' },
                            { id: 'ted', label: 'TED Talks' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    const cached = getFeed(tab.id as any);
                                    setCategory(tab.id as any);
                                    if (cached && cached.length > 0) {
                                        setArticles(cached);
                                        setLoading(false);
                                    } else {
                                        setArticles([]);
                                        setLoading(true);
                                    }
                                }}
                                className={cn(
                                    "relative px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap z-10",
                                    category === tab.id
                                        ? "text-stone-800"
                                        : "text-stone-500 hover:text-stone-700"
                                )}
                            >
                                {category === tab.id && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-stone-200/50 -z-10"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {category === 'ai_gen' ? (
                <div className="glass-panel p-8 rounded-xl flex flex-col items-center justify-center space-y-6 min-h-[300px]">
                    <div className="text-center space-y-2">
                        <Sparkles className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                        <h4 className="text-xl font-bold text-stone-800">Generate Custom Article</h4>
                        <p className="text-stone-500 text-sm max-w-md">
                            Enter a topic, and our AI will generate a tailored reading passage for you instantly.
                        </p>
                    </div>

                    <div className="w-full max-w-md space-y-4">
                        <div className="relative">
                            <input
                                type="text"
                                value={genTopic}
                                onChange={(e) => setGenTopic(e.target.value)}
                                placeholder="e.g., Quantum Computing, History of Jazz..."
                                className="w-full bg-white/50 border border-stone-200 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-400 transition-colors"
                            />
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !genTopic.trim()}
                            className="w-full bg-rose-100 hover:bg-rose-200 text-rose-600 font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            {isGenerating ? "Generating..." : "Generate Article"}
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                        {["Space Exploration", "Artificial Intelligence", "Climate Change", "Renaissance Art"].map(topic => (
                            <button
                                key={topic}
                                onClick={() => setGenTopic(topic)}
                                className="px-3 py-1 rounded-full bg-white/50 hover:bg-white text-xs text-stone-500 transition-colors border border-stone-200/50"
                            >
                                {topic}
                            </button>
                        ))}
                    </div>
                </div>
            ) : loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="glass-panel rounded-2xl overflow-hidden h-full border-white/40">
                            <div className="h-40 w-full bg-stone-200/50 animate-pulse" />
                            <div className="p-5 space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <div className="h-4 w-20 bg-stone-200/50 rounded animate-pulse" />
                                        <div className="h-4 w-4 bg-stone-200/50 rounded animate-pulse" />
                                    </div>
                                    <div className="h-6 w-full bg-stone-200/50 rounded animate-pulse" />
                                    <div className="h-6 w-2/3 bg-stone-200/50 rounded animate-pulse" />
                                </div>
                                <div className="pt-3 border-t border-stone-200/50 flex justify-between">
                                    <div className="h-4 w-16 bg-stone-200/50 rounded animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-12">
                    {(() => {
                        const now = Date.now();
                        const ONE_DAY = 24 * 60 * 60 * 1000;
                        const NEW_THRESHOLD = 2 * ONE_DAY; // 48 hours

                        const read = articles.filter(a => readArticleUrls.includes(a.link));
                        const unread = articles.filter(a => !readArticleUrls.includes(a.link));

                        const newArticles = unread.filter(a => {
                            const pub = new Date(a.pubDate).getTime();
                            return !isNaN(pub) && (now - pub) < NEW_THRESHOLD;
                        });

                        const olderUnread = unread.filter(a => {
                            const pub = new Date(a.pubDate).getTime();
                            return isNaN(pub) || (now - pub) >= NEW_THRESHOLD;
                        });

                        const renderSection = (title: string, items: ArticleItem[], icon?: React.ReactNode) => {
                            if (items.length === 0) return null;
                            return (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <h4 className="flex items-center gap-2 text-sm font-bold text-stone-400 uppercase tracking-widest pl-1">
                                        {icon}
                                        {title}
                                        <span className="bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded text-[10px] ml-1">{items.length}</span>
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {items.map(item => (
                                            <ArticleCard
                                                key={item.link}
                                                item={item}
                                                isRead={readArticleUrls.includes(item.link)}
                                                category={category}
                                                onSelect={onSelect}
                                                onDelete={(link) => handleDelete({ stopPropagation: () => { } } as any, link)} // Hacky but works for now or needs updated handler signature
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        };

                        return (
                            <>
                                {renderSection("New Arrivals", newArticles, <Sparkles className="w-4 h-4 text-amber-500" />)}
                                {renderSection("Unread", olderUnread, <BookOpen className="w-4 h-4 text-stone-400" />)}
                                {renderSection("Read History", read, <Check className="w-4 h-4 text-green-500" />)}

                                {articles.length === 0 && (
                                    <div className="text-center py-20 text-stone-400 italic">
                                        No articles found in this category.
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}

// Extracted Card Component for Reusability
function ArticleCard({ item, isRead, category, onSelect, onDelete }: {
    item: ArticleItem,
    isRead: boolean,
    category: string,
    onSelect: (url: string) => void,
    onDelete: (url: string) => void
}) {
    // Deterministic gradient generator
    const getGradient = (id: string) => {
        const gradients = [
            "bg-gradient-to-br from-rose-100 to-teal-100",
            "bg-gradient-to-br from-amber-100 to-lime-100",
            "bg-gradient-to-br from-cyan-100 to-fuchsia-100",
            "bg-gradient-to-br from-emerald-100 to-sky-100",
            "bg-gradient-to-br from-violet-100 to-rose-100",
            "bg-gradient-to-br from-orange-100 to-amber-100",
            "bg-gradient-to-br from-blue-100 to-indigo-100",
            "bg-gradient-to-br from-pink-100 to-rose-200",
            "bg-gradient-to-br from-lime-100 to-emerald-100",
            "bg-gradient-to-br from-sky-100 to-blue-200",
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return gradients[Math.abs(hash) % gradients.length];
    };

    return (
        <div
            onClick={() => onSelect(item.link)}
            className={cn(
                "glass-panel rounded-2xl cursor-pointer transition-all duration-500 group relative overflow-hidden flex flex-col h-full",
                // Soft Glass Border & Background
                "bg-white/60 backdrop-blur-md border border-white/40",
                isRead
                    ? "opacity-80 hover:opacity-100 grayscale-[0.3] hover:grayscale-0 shadow-none"
                    : "hover:-translate-y-1 hover:shadow-[0_12px_32px_-8px_rgba(251,191,36,0.15)] hover:bg-white/80"
            )}
        >
            {/* Cover Image Container */}
            <div className="h-44 w-full relative overflow-hidden bg-stone-100">
                <img
                    src={item.image || (() => {
                        let hash = 0;
                        for (let i = 0; i < item.title.length; i++) {
                            hash = item.title.charCodeAt(i) + ((hash << 5) - hash);
                        }
                        const safeHash = Math.abs(hash);

                        const keywordPools: Record<string, string[]> = {
                            'news': ['city', 'building', 'street', 'business', 'newspaper', 'meeting', 'conference', 'office', 'work'],
                            'psychology': ['brain', 'mind', 'thought', 'psychology', 'neuron', 'head', 'face', 'people'],
                            'ai_news': ['robot', 'technology', 'ai', 'chip', 'computer', 'code', 'server', 'future', 'cyber'],
                            'ielts': ['library', 'book', 'study', 'university', 'student', 'writing', 'pen', 'classroom', 'exam'],
                            'cet4': ['campus', 'student', 'book', 'study', 'college', 'desk'],
                            'cet6': ['university', 'library', 'reading', 'writing', 'learn', 'education'],
                            'ai_gen': ['abstract', 'art', 'future', 'colorful', 'design', 'creative'],
                            'ted': ['stage', 'speaker', 'audience', 'idea', 'presentation', 'mic']
                        };

                        const pool = keywordPools[category] || ['nature', 'water', 'sky', 'forest'];
                        const keyword = pool[safeHash % pool.length];

                        return `https://loremflickr.com/600/400/${keyword}?lock=${safeHash}`;
                    })()}
                    alt={item.title}
                    className={cn(
                        "w-full h-full object-cover transition-transform duration-700 ease-in-out will-change-transform group-hover:scale-105",
                        item.image ? "" : "opacity-90 grayscale-[0.2]"
                    )}
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                />

                {/* Fallback Gradient */}
                <div className={cn(
                    "w-full h-full absolute top-0 left-0 hidden",
                    getGradient(item.title)
                )} />

                {/* Read Badge */}
                {isRead && (
                    <div className="absolute top-3 left-3 bg-stone-900/40 backdrop-blur-md text-white text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5 z-10 border border-white/10">
                        <div className="w-1 h-1 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                        Read
                    </div>
                )}

                {/* Delete Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.link);
                    }}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/30 hover:bg-rose-500/90 backdrop-blur-md text-white/70 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-20 translate-y-2 group-hover:translate-y-0 duration-300"
                    title="Remove article"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Content Area */}
            <div className="p-5 flex flex-col flex-1 justify-between space-y-4">
                <div className="space-y-3">
                    {/* Meta Row */}
                    <div className="flex items-center justify-between border-b border-stone-200/50 pb-2">
                        <span className="text-[10px] font-bold tracking-[0.1em] text-amber-600/80 uppercase">
                            {item.source}
                        </span>
                        <span className="text-[10px] font-medium text-stone-400">
                            {new Date(item.pubDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                    </div>

                    {/* Title */}
                    <h4 className={cn(
                        "text-lg font-bold font-newsreader leading-[1.3] group-hover:text-amber-800 transition-colors line-clamp-3",
                        isRead ? "text-stone-500 decoration-stone-300 decoration-1" : "text-stone-800"
                    )}>
                        {item.title}
                    </h4>
                </div>

                {/* Footer / Action */}
                {!isRead && (
                    <div className="pt-2 flex items-center justify-end">
                        <span className="text-xs font-bold text-amber-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                            Read Article <ExternalLink className="w-3 h-3" />
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
