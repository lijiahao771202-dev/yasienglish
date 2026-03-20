"use client";

import { useEffect, useState } from "react";
import { Brain, ExternalLink, Loader2, BookOpen, Cpu, Sparkles, Send, RefreshCw, Trash2, Check, Settings2, LayoutGrid } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFeedStore } from "@/lib/feed-store";
import { useUserStore } from "@/lib/store";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";

export interface ArticleItem {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    snippet?: string;
    image?: string;
    fetchedAt?: number;
    quizCompleted?: boolean;
    quizCorrect?: number;
    quizTotal?: number;
    quizScorePercent?: number;
}

interface AIGenHistoryRecord {
    url: string;
    title: string;
    content?: string;
    textContent?: string;
    timestamp: number;
    isAIGenerated?: boolean;
    quizCompleted?: boolean;
    quizCorrect?: number;
    quizTotal?: number;
    quizScorePercent?: number;
}

type FeedCategory = 'psychology' | 'ai_news' | 'ai_gen';
type ArticleView = 'all' | 'new' | 'unread' | 'read';
type ArticleStatus = 'new' | 'unread' | 'read';

interface GeneratedArticleData {
    title: string;
    content: string;
    byline?: string;
    textContent?: string;
    blocks?: unknown[];
    siteName?: string;
    videoUrl?: string;
    url?: string;
    image?: string | null;
    difficulty?: 'cet4' | 'cet6' | 'ielts';
    isAIGenerated?: boolean;
}

interface RecommendedArticlesProps {
    onSelect: (url: string) => void;
    onArticleLoaded?: (article: GeneratedArticleData) => void;
    onListUpdate?: (articles: ArticleItem[]) => void;
}

function getArticleTimestamp(article: ArticleItem): number {
    const pubTimestamp = Date.parse(article.pubDate || "");
    if (Number.isFinite(pubTimestamp)) {
        return pubTimestamp;
    }

    return article.fetchedAt ?? 0;
}

function sortByNewest(items: ArticleItem[]): ArticleItem[] {
    return [...items].sort((left, right) => getArticleTimestamp(right) - getArticleTimestamp(left));
}

function uniqueByLink(items: ArticleItem[]): ArticleItem[] {
    const seenLinks = new Set<string>();
    return items.filter((item) => {
        if (seenLinks.has(item.link)) {
            return false;
        }
        seenLinks.add(item.link);
        return true;
    });
}

function formatArticleDate(article: ArticleItem): string {
    const timestamp = getArticleTimestamp(article);
    if (!timestamp) {
        return "未知日期";
    }

    return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function normalizeSnippet(snippet?: string): string {
    if (!snippet) return "";
    return snippet.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isArticleItem(value: unknown): value is ArticleItem {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ArticleItem>;
    return (
        typeof candidate.title === "string"
        && typeof candidate.link === "string"
        && typeof candidate.source === "string"
    );
}

export function RecommendedArticles({ onSelect, onArticleLoaded, onListUpdate }: RecommendedArticlesProps) {
    const [articles, setArticles] = useState<ArticleItem[]>([]);
    const [category, setCategory] = useState<FeedCategory>('psychology');
    const [activeView, setActiveView] = useState<ArticleView>('all');
    const [genTopic, setGenTopic] = useState("");
    const [genDifficulty, setGenDifficulty] = useState<'cet4' | 'cet6' | 'ielts'>('ielts');
    const [isGenerating, setIsGenerating] = useState(false);

    // New states for enhanced UX
    const [fetchCount, setFetchCount] = useState(3); // Articles to fetch per refresh
    const [showSettings, setShowSettings] = useState(false);
    const [isFetching, setIsFetching] = useState(false); // Just for button state
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

    const { setFeed, getFeed, loadFeedFromDB, deleteArticle } = useFeedStore();
    const { readArticleUrls } = useUserStore();
    const listContainerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.04,
                delayChildren: 0.06,
            },
        },
    };
    const listItemVariants = {
        hidden: { opacity: 0, scale: 0.998 },
        show: {
            opacity: 1,
            scale: 1,
            transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
        },
    };

    // Preset topics per difficulty
    const PRESET_TOPICS: Record<string, string[]> = {
        cet4: ["Daily Life", "Campus Life", "Travel", "Technology Basics", "Health & Fitness"],
        cet6: ["Social Issues", "Economics", "Education Reform", "Environment", "Psychology"],
        ielts: ["Urbanization", "Globalization", "Scientific Ethics", "Cultural Heritage", "AI & Society"],
    };

    const loadAIGenHistory = async () => {
        try {
            const { db } = await import("@/lib/db");
            const rows = (await db.articles
                .toArray() as unknown as AIGenHistoryRecord[])
                .filter((row) => Boolean((row as unknown as { isAIGenerated?: boolean }).isAIGenerated))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            const historyItems: ArticleItem[] = rows.map((row) => ({
                title: row.title || "Untitled",
                link: row.url,
                pubDate: new Date(row.timestamp || Date.now()).toISOString(),
                source: "AI Gen",
                snippet: (row.textContent || row.content || "").slice(0, 180),
                fetchedAt: row.timestamp || Date.now(),
                quizCompleted: row.quizCompleted,
                quizCorrect: row.quizCorrect,
                quizTotal: row.quizTotal,
                quizScorePercent: row.quizScorePercent,
            }));

            const ordered = sortByNewest(historyItems);
            setArticles(ordered);
            if (onListUpdate) onListUpdate(ordered);
        } catch (error) {
            console.error("Failed to load AI-generated history:", error);
            setArticles([]);
            if (onListUpdate) onListUpdate([]);
        }
    };

    // Load from DB only (no auto-fetch from API)
    useEffect(() => {
        if (category === 'ai_gen') {
            loadAIGenHistory();
            return;
        }

        // Only load from DB/memory - NO auto-fetch
        loadFeedFromDB(category).then(() => {
            const cachedFeeds = getFeed(category);
            if (cachedFeeds) {
                setArticles(sortByNewest(cachedFeeds));
                if (onListUpdate) {
                    onListUpdate(sortByNewest(cachedFeeds));
                }
            }
        });
    }, [category, getFeed, loadFeedFromDB, onListUpdate]);

    useEffect(() => {
        setActiveView('all');
    }, [category]);

    const handleGenerate = async () => {
        if (!genTopic.trim()) return;
        setIsGenerating(true);
        try {
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: genTopic, difficulty: genDifficulty }),
            });
            const data = await res.json();
            const articleUrl = `ai-gen://${genDifficulty}/${Date.now()}`;
            data.url = articleUrl;
            data.difficulty = genDifficulty;
            data.isAIGenerated = true;

            // Save to IndexedDB
            try {
                const { db } = await import("@/lib/db");
                const timestamp = Date.now();
                await db.articles.put({
                    url: articleUrl,
                    title: data.title || genTopic,
                    content: data.content || "",
                    textContent: data.textContent || data.content || "",
                    byline: data.byline,
                    blocks: data.blocks,
                    timestamp,
                    difficulty: genDifficulty,
                    isAIGenerated: true,
                    quizCompleted: false,
                });

                const historyItem: ArticleItem = {
                    title: data.title || genTopic,
                    link: articleUrl,
                    pubDate: new Date(timestamp).toISOString(),
                    source: "AI Gen",
                    snippet: (data.textContent || data.content || "").slice(0, 180),
                    fetchedAt: timestamp,
                    quizCompleted: false,
                };
                setArticles((prev) => {
                    const next = uniqueByLink(sortByNewest([historyItem, ...prev]));
                    if (onListUpdate) onListUpdate(next);
                    return next;
                });
            } catch (dbErr) {
                console.error("Failed to save AI article to DB:", dbErr);
            }

            if (onArticleLoaded) {
                onArticleLoaded(data as GeneratedArticleData);
            }
        } catch (error) {
            console.error("Generation error:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRefresh = async () => {
        setIsFetching(true); // Use isFetching instead of loading to avoid skeleton
        try {
            // Add timestamp to bypass cache and count parameter
            const res = await fetch(`/api/feed?category=${category}&count=${fetchCount}&t=${Date.now()}`);
            const data: unknown = await res.json();
            if (Array.isArray(data)) {
                const fetchedAt = Date.now();
                const fetchedArticles = data
                    .filter(isArticleItem)
                    .slice(0, fetchCount)
                    .map((item) => ({
                        ...item,
                        pubDate: item.pubDate || new Date(fetchedAt).toISOString(),
                        fetchedAt: item.fetchedAt ?? fetchedAt,
                    }));

                // Merge with existing articles (keep old, add new at top, remove duplicates)
                const existingLinks = new Set(articles.map(a => a.link));
                const uniqueNewArticles = uniqueByLink(fetchedArticles.filter((article) => !existingLinks.has(article.link)));

                if (uniqueNewArticles.length > 0) {
                    // Show success notification
                    setNotification({
                        message: `成功抓取 ${uniqueNewArticles.length} 篇新文章`,
                        type: 'success'
                    });

                    // Combine and sort by time, then dedupe by link.
                    const mergedArticles = uniqueByLink(sortByNewest([...fetchedArticles, ...articles]));

                    setArticles(mergedArticles);
                    // Update global store & DB
                    await setFeed(category, mergedArticles);
                    if (onListUpdate) {
                        onListUpdate(mergedArticles);
                    }
                } else {
                    setNotification({
                        message: "暂时没有发现新文章",
                        type: 'info'
                    });
                }
            }
        } catch (error) {
            console.error("Refresh error:", error);
            setNotification({ message: "抓取失败，请稍后重试", type: 'info' });
        } finally {
            setIsFetching(false);
            // Clear notification after 3 seconds
            setTimeout(() => setNotification(null), 3000);
        }
    };

    const handleDelete = async (link: string) => {
        if (category === 'ai_gen') {
            if (confirm('Are you sure you want to remove this article?')) {
                try {
                    const { db } = await import("@/lib/db");
                    await db.articles.delete(link);
                    setArticles((prev) => {
                        const next = prev.filter(a => a.link !== link);
                        if (onListUpdate) onListUpdate(next);
                        return next;
                    });
                } catch (error) {
                    console.error("Delete AI article failed:", error);
                }
            }
            return;
        }

        if (confirm('Are you sure you want to remove this article?')) {
            await deleteArticle(category, link);
            setArticles(prev => prev.filter(a => a.link !== link));
        }
    };

    return (
        <motion.div
            className="w-full max-w-7xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
            <LiquidGlassPanel className="mb-7 rounded-[30px] p-5 md:p-7">
                <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/18 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 left-6 h-40 w-40 rounded-full bg-violet-300/18 blur-3xl" />
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="relative z-10 min-w-0 flex-1">
                        <h3 className="flex items-center gap-2 font-newsreader text-[1.75rem] font-semibold leading-none tracking-tight text-slate-900 md:text-[2.05rem]">
                            {category === 'psychology' && <Brain className="h-5 w-5 text-violet-600" />}
                            {category === 'ai_news' && <Cpu className="h-5 w-5 text-cyan-600" />}
                            {category === 'ai_gen' && <Sparkles className="h-5 w-5 text-pink-500" />}
                            Reading Feed
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                            Liquid glass stream for deep reading. Fresh first, context preserved.
                        </p>
                    </div>
                </div>

                <div className="mt-5">
                    <LiquidGlassPanel className="rounded-2xl p-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-xl bg-white/28 p-1.5 scrollbar-hide">
                                {([
                                    { id: 'psychology', label: 'Psychology' },
                                    { id: 'ai_news', label: 'AI News' },
                                    { id: 'ai_gen', label: 'AI Gen' },
                                ] as Array<{ id: FeedCategory; label: string }>).map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            if (tab.id === 'ai_gen') {
                                                setCategory(tab.id);
                                                return;
                                            }
                                            const cached = getFeed(tab.id);
                                            setCategory(tab.id);
                                            if (cached && cached.length > 0) {
                                                setArticles(sortByNewest(cached));
                                            } else {
                                                setArticles([]);
                                            }
                                        }}
                                        className={cn(
                                            "relative whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all",
                                            category === tab.id
                                                ? "text-slate-900"
                                                : "text-slate-500 hover:text-slate-700"
                                        )}
                                    >
                                        {category === tab.id && (
                                            <motion.div
                                                layoutId="activeTab"
                                                className="absolute inset-0 -z-10 rounded-xl border border-white/75 bg-white/70 shadow-[0_14px_24px_-18px_rgba(15,23,42,0.8)] backdrop-blur-xl"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="relative md:ml-auto">
                                <div className="flex h-[42px] items-center border-l border-white/55 pl-2">
                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-all hover:bg-white/40 hover:text-slate-800"
                                        title="设置抓取数量"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                    </button>

                                    <button
                                        onClick={handleRefresh}
                                        disabled={isFetching}
                                        className="ml-1 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-white/40 disabled:opacity-50"
                                        title={`刷新 ${category} 文章`}
                                    >
                                        <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                                        抓取 {fetchCount} 篇
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {showSettings && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                            className="absolute right-0 top-full z-50 mt-2 min-w-[170px] rounded-2xl border border-white/65 bg-white/56 p-3 shadow-[0_22px_42px_-22px_rgba(15,23,42,0.6)] ring-1 ring-white/60 backdrop-blur-2xl"
                                        >
                                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">抓取数量</div>
                                            <div className="flex gap-1.5">
                                                {[1, 2, 3, 4, 5].map(count => (
                                                    <button
                                                        key={count}
                                                        onClick={() => {
                                                            setFetchCount(count);
                                                            setShowSettings(false);
                                                        }}
                                                        className={cn(
                                                            "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all",
                                                            fetchCount === count
                                                                ? "border-cyan-200 bg-cyan-100/70 text-cyan-700"
                                                                : "border-white/65 bg-white/55 text-slate-500 hover:bg-white/75"
                                                        )}
                                                    >
                                                        {count}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </LiquidGlassPanel>
                </div>
            </LiquidGlassPanel>

            {category === 'ai_gen' ? (
                <div className="space-y-6">
                    {/* Difficulty Selector */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {([
                            {
                                id: 'cet4' as const,
                                label: 'CET-4 四级',
                                desc: '4000 词汇 · 300-400 词',
                                detail: '简单句为主，日常话题',
                                color: 'emerald',
                                borderActive: 'border-emerald-300 ring-emerald-200/50',
                                bgActive: 'bg-emerald-50/60',
                                iconBg: 'bg-emerald-100 text-emerald-600',
                            },
                            {
                                id: 'cet6' as const,
                                label: 'CET-6 六级',
                                desc: '6000 词汇 · 400-500 词',
                                detail: '复合句+被动语态',
                                color: 'blue',
                                borderActive: 'border-blue-300 ring-blue-200/50',
                                bgActive: 'bg-blue-50/60',
                                iconBg: 'bg-blue-100 text-blue-600',
                            },
                            {
                                id: 'ielts' as const,
                                label: 'IELTS 雅思',
                                desc: '8000+ 词汇 · 500-700 词',
                                detail: '学术词汇+复杂句式',
                                color: 'violet',
                                borderActive: 'border-violet-300 ring-violet-200/50',
                                bgActive: 'bg-violet-50/60',
                                iconBg: 'bg-violet-100 text-violet-600',
                            },
                        ]).map((diff) => {
                            const isActive = genDifficulty === diff.id;
                            return (
                                <LiquidGlassPanel
                                    key={diff.id}
                                    onClick={() => setGenDifficulty(diff.id)}
                                    className={cn(
                                        "cursor-pointer rounded-[22px] p-5 transition-all duration-300",
                                        isActive
                                            ? `${diff.borderActive} ring-2 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.6)]`
                                            : "hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-18px_rgba(15,23,42,0.5)]"
                                    )}
                                >
                                    <div className={cn(
                                        "mb-3 inline-flex rounded-xl p-2.5",
                                        isActive ? diff.iconBg : "bg-white/50 text-slate-500"
                                    )}>
                                        <Sparkles className="h-5 w-5" />
                                    </div>
                                    <h4 className="font-newsreader text-lg font-bold text-slate-900">
                                        {diff.label}
                                    </h4>
                                    <p className="mt-1 text-xs font-medium text-slate-500">
                                        {diff.desc}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        {diff.detail}
                                    </p>
                                </LiquidGlassPanel>
                            );
                        })}
                    </div>

                    {/* Topic Selection */}
                    <LiquidGlassPanel className="relative rounded-[24px] p-6">
                        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-pink-300/15 blur-3xl" />
                        <div className="pointer-events-none absolute -left-12 -bottom-12 h-36 w-36 rounded-full bg-cyan-300/15 blur-3xl" />

                        <h4 className="mb-1 text-sm font-bold text-slate-800">选择主题</h4>
                        <p className="mb-4 text-xs text-slate-500">
                            点击预设标签或输入自定义主题
                        </p>

                        {/* Preset Topics */}
                        <div className="mb-4 flex flex-wrap gap-2">
                            {(PRESET_TOPICS[genDifficulty] || []).map(topic => (
                                <button
                                    key={topic}
                                    onClick={() => setGenTopic(topic)}
                                    className={cn(
                                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                                        genTopic === topic
                                            ? "border-cyan-300 bg-cyan-50/80 text-cyan-800 shadow-sm"
                                            : "border-white/60 bg-white/45 text-slate-500 hover:bg-white/70 hover:text-slate-700"
                                    )}
                                >
                                    {topic}
                                </button>
                            ))}
                        </div>

                        {/* Custom Input */}
                        <div className="relative">
                            <input
                                type="text"
                                value={genTopic}
                                onChange={(e) => setGenTopic(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                                placeholder="或输入自定义主题 e.g., Quantum Computing..."
                                className="w-full rounded-xl border border-white/70 bg-white/50 px-4 py-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-colors placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none"
                            />
                        </div>
                    </LiquidGlassPanel>

                    {/* Generate Button */}
                    <LiquidGlassPanel className="rounded-[20px] p-4">
                        {/* Selection Summary */}
                        {genTopic.trim() && (
                            <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                                <span className={cn(
                                    "rounded-md border px-2 py-0.5 font-semibold",
                                    genDifficulty === 'cet4' && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                    genDifficulty === 'cet6' && "border-blue-200 bg-blue-50 text-blue-700",
                                    genDifficulty === 'ielts' && "border-violet-200 bg-violet-50 text-violet-700"
                                )}>
                                    {genDifficulty === 'cet4' ? '四级' : genDifficulty === 'cet6' ? '六级' : '雅思'}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="truncate font-medium text-slate-700">{genTopic}</span>
                            </div>
                        )}
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !genTopic.trim()}
                            className={cn(
                                "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all duration-300",
                                isGenerating || !genTopic.trim()
                                    ? "border border-white/40 bg-white/30 text-slate-400 cursor-not-allowed"
                                    : "border border-white/70 bg-white/70 text-slate-800 shadow-[0_14px_30px_-20px_rgba(15,23,42,0.7)] hover:bg-white/90 hover:shadow-[0_20px_40px_-20px_rgba(15,23,42,0.8)]"
                            )}
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            {isGenerating ? "正在生成文章..." : "生成文章"}
                        </button>
                    </LiquidGlassPanel>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-sm font-bold text-slate-800">历史文章</h4>
                            <span className="text-xs text-slate-500">{articles.length} 篇</span>
                        </div>

                        {articles.length === 0 ? (
                            <LiquidGlassPanel className="rounded-2xl p-8 text-center text-sm text-slate-500">
                                暂无历史文章，先生成一篇试试
                            </LiquidGlassPanel>
                        ) : (
                            <motion.div
                                className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6"
                                variants={listContainerVariants}
                                initial="hidden"
                                animate="show"
                            >
                                {sortByNewest(articles).map((item) => (
                                    <motion.div
                                        key={item.link}
                                        variants={listItemVariants}
                                    >
                                        <ArticleCard
                                            item={item}
                                            status={item.quizCompleted ? 'read' : 'unread'}
                                            category="ai_gen"
                                            onSelect={onSelect}
                                            onDelete={handleDelete}
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-8">
                    {(() => {
                        const now = Date.now();
                        const ONE_DAY = 24 * 60 * 60 * 1000;
                        const NEW_THRESHOLD = 2 * ONE_DAY; // 48 hours

                        const read = sortByNewest(articles.filter(a => readArticleUrls.includes(a.link)));
                        const unread = sortByNewest(articles.filter(a => !readArticleUrls.includes(a.link)));

                        const newArrivals = unread.filter((article) => {
                            const articleTime = getArticleTimestamp(article);
                            return articleTime > 0 && (now - articleTime) < NEW_THRESHOLD;
                        });

                        const unreadBacklog = unread.filter((article) => {
                            const articleTime = getArticleTimestamp(article);
                            return articleTime <= 0 || (now - articleTime) >= NEW_THRESHOLD;
                        });

                        const orderedAll = uniqueByLink([
                            ...newArrivals,
                            ...unreadBacklog,
                            ...read,
                        ]);

                        const statusByLink = new Map<string, ArticleStatus>();
                        newArrivals.forEach((item) => statusByLink.set(item.link, 'new'));
                        unreadBacklog.forEach((item) => {
                            if (!statusByLink.has(item.link)) {
                                statusByLink.set(item.link, 'unread');
                            }
                        });
                        read.forEach((item) => {
                            if (!statusByLink.has(item.link)) {
                                statusByLink.set(item.link, 'read');
                            }
                        });

                        const filteredArticles =
                            activeView === 'all'
                                ? orderedAll
                                : activeView === 'new'
                                    ? newArrivals
                                    : activeView === 'unread'
                                        ? unreadBacklog
                                        : read;

                        const filterItems = [
                            { id: 'all' as const, label: '全部', count: orderedAll.length, icon: LayoutGrid },
                            { id: 'new' as const, label: '新到达', count: newArrivals.length, icon: Sparkles },
                            { id: 'unread' as const, label: '待阅读', count: unreadBacklog.length, icon: BookOpen },
                            { id: 'read' as const, label: '已读历史', count: read.length, icon: Check },
                        ];

                        return (
                            <>
                                {articles.length === 0 && (
                                    <LiquidGlassPanel className="rounded-[24px] py-16 text-center text-sm italic text-slate-500">
                                        点击刷新按钮抓取文章 / Click refresh to fetch articles
                                    </LiquidGlassPanel>
                                )}

                                {articles.length > 0 && (
                                    <div className="space-y-6">
                                        <LiquidGlassPanel className="rounded-[22px] p-2.5">
                                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                                {filterItems.map((filterItem) => {
                                                    const Icon = filterItem.icon;
                                                    const isActive = activeView === filterItem.id;
                                                    return (
                                                        <button
                                                            key={filterItem.id}
                                                            onClick={() => setActiveView(filterItem.id)}
                                                            className={cn(
                                                                "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-300",
                                                                isActive
                                                                    ? "border border-white/75 bg-white/70 text-slate-900 shadow-[0_16px_28px_-18px_rgba(15,23,42,0.7)]"
                                                                    : "border border-transparent bg-white/30 text-slate-600 hover:bg-white/50"
                                                            )}
                                                        >
                                                            <Icon className="h-4 w-4" />
                                                            <span>{filterItem.label}</span>
                                                            <span className={cn(
                                                                "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                                                                isActive ? "bg-slate-900 text-white" : "bg-white/75 text-slate-500"
                                                            )}>
                                                                {filterItem.count}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </LiquidGlassPanel>

                                        {filteredArticles.length === 0 ? (
                                            <LiquidGlassPanel className="rounded-2xl p-10 text-center text-sm text-slate-500">
                                                这个分组暂时没有文章
                                            </LiquidGlassPanel>
                                        ) : (
                                            <motion.div
                                                className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6"
                                                variants={listContainerVariants}
                                                initial="hidden"
                                                animate="show"
                                            >
                                                {filteredArticles.map((item) => (
                                                    <motion.div
                                                        key={item.link}
                                                        variants={listItemVariants}
                                                    >
                                                        <ArticleCard
                                                            item={item}
                                                            status={statusByLink.get(item.link) ?? 'unread'}
                                                            category={category}
                                                            onSelect={onSelect}
                                                            onDelete={handleDelete}
                                                        />
                                                    </motion.div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}

            {/* Notification Toast */}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                        className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/70 bg-white/46 px-5 py-2.5 text-sm font-bold tracking-wide text-slate-800 shadow-[0_22px_42px_-22px_rgba(15,23,42,0.75)] ring-1 ring-white/65 backdrop-blur-2xl"
                    >
                        {notification.type === 'success' ? (
                            <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.6)] animate-pulse" />
                        ) : (
                            <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
                        )}
                        {notification.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// Extracted Card Component for Reusability
function ArticleCard({ item, status, category, onSelect, onDelete }: {
    item: ArticleItem,
    status: ArticleStatus,
    category: FeedCategory,
    onSelect: (url: string) => void,
    onDelete: (url: string) => void
}) {
    const isRead = status === 'read';
    const statusMeta = status === 'new'
        ? { label: '新到达', className: 'border-amber-200/80 bg-amber-100/80 text-amber-700' }
        : status === 'read'
            ? { label: '已读', className: 'border-emerald-200/80 bg-emerald-100/80 text-emerald-700' }
            : { label: '未读', className: 'border-slate-200/80 bg-white/75 text-slate-600' };

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
        <LiquidGlassPanel
            onClick={() => onSelect(item.link)}
            className={cn(
                "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[26px] transition-all duration-500",
                isRead
                    ? "shadow-[0_14px_32px_-26px_rgba(15,23,42,0.68)]"
                    : "hover:shadow-[0_28px_48px_-26px_rgba(15,23,42,0.95)]"
            )}
        >
            <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(120deg,rgba(255,255,255,0)_18%,rgba(255,255,255,0.14)_46%,rgba(255,255,255,0)_72%)] opacity-40" />
            {/* Cover Image Container */}
            <div className="relative h-48 w-full overflow-hidden bg-slate-100 md:h-52">
                {/* Background Image - Picsum with deterministic seed */}
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover transition-transform duration-700 ease-in-out will-change-transform group-hover:scale-105"
                        onError={(e) => {
                            // On error, show gradient fallback
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                    />
                ) : (
                    <>
                        {/* Picsum random photo based on title hash */}
                        <img
                            src={`https://picsum.photos/seed/${encodeURIComponent(item.title.slice(0, 20))}/800/600`}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-700 ease-in-out will-change-transform group-hover:scale-105"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                // Show gradient fallback
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                    const fallback = parent.querySelector('[data-fallback]') as HTMLElement;
                                    if (fallback) fallback.classList.remove('hidden');
                                }
                            }}
                        />

                        {/* Gradient fallback if Picsum fails */}
                        <div
                            data-fallback
                            className={cn(
                                "w-full h-full absolute inset-0 hidden",
                                getGradient(item.title)
                            )}
                        />

                    </>
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/42 via-black/10 to-transparent" />

                {/* Fallback Gradient (shown on image load error) */}
                <div className={cn(
                    "w-full h-full absolute top-0 left-0 hidden",
                    getGradient(item.title)
                )} />

                {/* Source Badge */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-white/35 bg-black/45 px-2.5 py-1 backdrop-blur-md">
                    {category === 'psychology' && <Brain className="h-3 w-3 text-white/90" />}
                    {category === 'ai_news' && <Cpu className="h-3 w-3 text-white/90" />}
                    {category === 'ai_gen' && <Sparkles className="h-3 w-3 text-white/90" />}
                    <span className="text-[10px] font-medium uppercase tracking-wider text-white/90">{item.source}</span>
                </div>

                {/* Read Badge */}
                <div className={cn(
                    "absolute left-3 top-3 z-10 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide backdrop-blur-sm",
                    statusMeta.className
                )}>
                    {statusMeta.label}
                </div>

                {category === "ai_gen" && item.quizCompleted && typeof item.quizScorePercent === "number" && (
                    <div className="absolute left-3 top-11 z-10 rounded-full border border-cyan-200/80 bg-cyan-100/90 px-2.5 py-1 text-[10px] font-bold tracking-wide text-cyan-800 backdrop-blur-sm">
                        得分 {item.quizScorePercent}%{typeof item.quizCorrect === "number" && typeof item.quizTotal === "number" ? ` · ${item.quizCorrect}/${item.quizTotal}` : ""}
                    </div>
                )}

                {/* Delete Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.link);
                    }}
                    className="absolute right-3 top-3 z-20 translate-y-2 rounded-full border border-white/35 bg-black/30 p-2 text-white/75 opacity-0 backdrop-blur-md transition-all duration-300 hover:bg-rose-500/90 hover:text-white group-hover:translate-y-0 group-hover:opacity-100"
                    title="Remove article"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex flex-1 flex-col justify-between space-y-3 p-5 md:p-6">
                <div className="space-y-2">
                    {/* Date Only (source is on cover) */}
                    <div className="flex items-center justify-end">
                        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                            {formatArticleDate(item)}
                        </span>
                    </div>

                    {/* Title */}
                    <h4 className={cn(
                        "line-clamp-3 font-newsreader text-[1.5rem] font-semibold leading-[1.08] tracking-[-0.02em] transition-colors md:text-[1.62rem]",
                        isRead ? "text-slate-600" : "text-slate-900 group-hover:text-slate-700"
                    )}>
                        {item.title}
                    </h4>

                    {normalizeSnippet(item.snippet) && (
                        <p className={cn(
                            "line-clamp-2 pt-1 text-sm leading-relaxed",
                            isRead ? "text-slate-400" : "text-slate-500"
                        )}>
                            {normalizeSnippet(item.snippet)}
                        </p>
                    )}
                </div>

                {/* Footer / Action */}
                <div className="flex items-center justify-end pt-2">
                    <span className={cn(
                        "flex items-center gap-1 text-xs font-semibold transition-all duration-300",
                        isRead
                            ? "text-slate-400 group-hover:text-slate-500"
                            : "text-cyan-700 group-hover:text-cyan-800"
                    )}>
                        {isRead ? "Revisit" : "Read Article"} <ExternalLink className="h-3 w-3" />
                    </span>
                </div>
            </div>


        </LiquidGlassPanel>
    );
}
