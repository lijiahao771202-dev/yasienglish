"use client";

import { useEffect, useState } from "react";
import { Newspaper, Brain, ExternalLink, Loader2, BookOpen, GraduationCap, Cpu, Sparkles, Send, RefreshCw, Trash2 } from "lucide-react";
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
    const [category, setCategory] = useState<'news' | 'psychology' | 'ielts' | 'cet4' | 'cet6' | 'ai_news' | 'ai_gen'>('news');
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
                <h3 className="text-xl font-semibold text-stone-800 flex items-center gap-2">
                    {category === 'news' && <Newspaper className="w-5 h-5 text-blue-600" />}
                    {category === 'psychology' && <Brain className="w-5 h-5 text-purple-600" />}
                    {(category === 'ielts' || category === 'cet4' || category === 'cet6') && <GraduationCap className="w-5 h-5 text-amber-500" />}
                    {category === 'ai_news' && <Cpu className="w-5 h-5 text-indigo-600" />}
                    {category === 'ai_gen' && <Sparkles className="w-5 h-5 text-rose-500" />}
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

                <div className="flex flex-wrap gap-2 bg-white/50 p-2 rounded-lg border border-stone-200/50 overflow-x-auto">
                    {[
                        { id: 'news', label: 'Global News' },
                        { id: 'psychology', label: 'Psychology' },
                        { id: 'ai_news', label: 'AI News' },
                        { id: 'ielts', label: 'IELTS' },
                        { id: 'cet4', label: 'CET-4' },
                        { id: 'cet6', label: 'CET-6' },
                        { id: 'ai_gen', label: 'AI Gen' },
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
                                "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                                category === tab.id
                                    ? "bg-white shadow-sm text-stone-800 border border-stone-200"
                                    : "text-stone-500 hover:text-stone-700 hover:bg-white/50"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map((item, i) => {
                        const isRead = readArticleUrls.includes(item.link);
                        return (
                            <div
                                key={item.link}
                                onClick={() => {
                                    markArticleAsRead(item.link);
                                    onSelect(item.link);
                                }}
                                className={cn(
                                    "glass-panel rounded-2xl cursor-pointer transition-all group relative overflow-hidden flex flex-col h-full border-white/40",
                                    isRead
                                        ? "opacity-80 hover:opacity-100 grayscale-[0.3] hover:grayscale-0"
                                        : "hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10"
                                )}
                            >
                                {/* Cover Image */}
                                <div className="h-40 w-full relative overflow-hidden bg-stone-100">
                                    {/* Fallback Image (shown if no extracted image) */}
                                    <img
                                        src={item.image || (() => {
                                            // Simple hash for deterministic lock & keyword selection
                                            let hash = 0;
                                            for (let i = 0; i < item.title.length; i++) {
                                                hash = item.title.charCodeAt(i) + ((hash << 5) - hash);
                                            }
                                            const safeHash = Math.abs(hash);

                                            // Diverse keyword pools to prevent repetition
                                            const keywordPools: Record<string, string[]> = {
                                                'news': ['city', 'building', 'street', 'business', 'newspaper', 'meeting', 'conference', 'office', 'work'],
                                                'psychology': ['brain', 'mind', 'thought', 'psychology', 'neuron', 'head', 'face', 'people'],
                                                'ai_news': ['robot', 'technology', 'ai', 'chip', 'computer', 'code', 'server', 'future', 'cyber'],
                                                'ielts': ['library', 'book', 'study', 'university', 'student', 'writing', 'pen', 'classroom', 'exam'],
                                                'cet4': ['campus', 'student', 'book', 'study', 'college', 'desk'],
                                                'cet6': ['university', 'library', 'reading', 'writing', 'learn', 'education'],
                                                'ai_gen': ['abstract', 'art', 'future', 'colorful', 'design', 'creative']
                                            };

                                            const pool = keywordPools[category] || ['nature', 'water', 'sky', 'forest'];
                                            const keyword = pool[safeHash % pool.length];

                                            return `https://loremflickr.com/600/400/${keyword}?lock=${safeHash}`;
                                        })()}
                                        alt={item.title}
                                        className={cn(
                                            "w-full h-full object-cover transition-transform duration-700 group-hover:scale-110",
                                            item.image ? "" : "opacity-90 grayscale-[0.2]"
                                        )}
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />

                                    {/* Ultimate Fallback Gradient (only if both images fail) */}
                                    <div className={cn(
                                        "w-full h-full absolute top-0 left-0 hidden",
                                        getGradient(item.title)
                                    )} />

                                    {/* Read Badge */}
                                    {isRead && (
                                        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                            READ
                                        </div>
                                    )}

                                    {/* Delete Button */}
                                    <button
                                        onClick={(e) => handleDelete(e, item.link)}
                                        className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-red-500/80 backdrop-blur-md text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-20 transform translate-y-2 group-hover:translate-y-0"
                                        title="Remove article"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-5 flex flex-col flex-1 justify-between space-y-4 bg-white/40 backdrop-blur-sm">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold tracking-wider text-stone-500 uppercase bg-stone-100/80 px-2 py-1 rounded-md">
                                                {item.source}
                                            </span>
                                            <ExternalLink className="w-3 h-3 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <h4 className={cn(
                                            "text-base font-bold leading-snug line-clamp-3",
                                            isRead ? "text-stone-500" : "text-stone-800 group-hover:text-amber-700 transition-colors"
                                        )}>
                                            {item.title}
                                        </h4>
                                    </div>

                                    <div className="pt-3 border-t border-stone-200/50 flex justify-between items-center">
                                        <p className="text-xs text-stone-400 font-medium">
                                            {new Date(item.pubDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </p>
                                        {!isRead && (
                                            <span className="text-xs font-semibold text-amber-600 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                Read Now →
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
