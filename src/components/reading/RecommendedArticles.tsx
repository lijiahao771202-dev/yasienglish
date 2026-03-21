"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, ExternalLink, Loader2, BookOpen, Cpu, Sparkles, Send, RefreshCw, Trash2, Check, Settings2, LayoutGrid, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFeedStore } from "@/lib/feed-store";
import { useUserStore } from "@/lib/store";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { applyServerProfilePatchToLocal } from "@/lib/user-repository";
import { CAT_RANK_TIERS, getCatRankIconByTierId, getCatRankTier, getCatScoreToNextRank, getLegacyBandFromScore } from "@/lib/cat-score";
import { CatGrowthChart } from "@/components/reading/CatGrowthChart";

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

type FeedCategory = 'psychology' | 'ai_news' | 'ai_gen' | 'cat_mode';
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
    isCatMode?: boolean;
    catSessionId?: string;
    catBand?: number;
    catScoreSnapshot?: number;
    catThetaSnapshot?: number;
    catSeSnapshot?: number;
    catSessionBlueprint?: {
        minItems?: number;
        maxItems?: number;
        targetSe?: number;
        stopRule?: string;
        challengeRatioTarget?: [number, number];
        passages?: Array<{
            passageIndex: number;
            title: string;
            content: string;
            targetScore: number;
            qualityTier: "ok" | "low_confidence";
        }>;
        items?: unknown[];
    };
    catQuizBlueprint?: {
        score?: number;
        questionCount?: number;
        ratioBandLabel?: string;
        distribution?: Record<string, number>;
        allowedTypes?: string[];
    };
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
    const [loadingArticleLink, setLoadingArticleLink] = useState<string | null>(null);
    const [catTopic, setCatTopic] = useState("");
    const [isStartingCat, setIsStartingCat] = useState(false);
    const [catStartError, setCatStartError] = useState<string | null>(null);
    const [isCatRankOverviewOpen, setIsCatRankOverviewOpen] = useState(false);

    const { setFeed, getFeed, loadFeedFromDB, deleteArticle } = useFeedStore();
    const { readArticleUrls } = useUserStore();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const catScore = typeof profile?.cat_score === "number" ? profile.cat_score : 1000;
    const catBand = typeof profile?.cat_current_band === "number"
        ? profile.cat_current_band
        : getLegacyBandFromScore(catScore);
    const catRank = getCatRankTier(catScore);
    const catScoreToNextRank = getCatScoreToNextRank(catScore);
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
    const feedViewModel = useMemo(() => {
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const NEW_THRESHOLD = 2 * ONE_DAY;

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

        return {
            filterItems,
            filteredArticles,
            orderedAll,
            statusByLink,
        };
    }, [activeView, articles, readArticleUrls]);

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
        if (category === 'cat_mode') {
            setArticles([]);
            onListUpdate?.([]);
            return;
        }

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
        setIsGenerating(true);
        try {
            const normalizedTopic = genTopic.trim();
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: normalizedTopic || undefined,
                    difficulty: genDifficulty,
                }),
            });
            const data = await res.json();
            const articleUrl = `ai-gen://${genDifficulty}/${Date.now()}`;
            data.url = articleUrl;
            data.difficulty = genDifficulty;
            data.isAIGenerated = true;
            const fallbackTopicTitle = typeof data?.topicSeed?.topicLine === "string"
                ? data.topicSeed.topicLine
                : (normalizedTopic || "随机主题");
            const finalTitle = data.title || fallbackTopicTitle;

            // Save to IndexedDB
            try {
                const { db } = await import("@/lib/db");
                const timestamp = Date.now();
                await db.articles.put({
                    url: articleUrl,
                    title: finalTitle,
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
                    title: finalTitle,
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
        if (category === "cat_mode") {
            return;
        }
        if (category === "ai_gen") {
            await loadAIGenHistory();
            return;
        }
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

    const handleStartCatSession = async () => {
        if (isStartingCat) return;
        setIsStartingCat(true);
        setCatStartError(null);
        try {
            const response = await fetch("/api/ai/cat/session/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: catTopic.trim() || undefined,
                    band: catBand,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "启动 CAT 训练失败。");
            }

            await applyServerProfilePatchToLocal({
                cat_score: payload?.catProfile?.score,
                cat_level: payload?.catProfile?.level,
                cat_theta: payload?.catProfile?.theta,
                cat_se: payload?.catProfile?.se,
                cat_points: payload?.catProfile?.points,
                cat_current_band: payload?.catProfile?.currentBand,
            });

            if (payload?.article && onArticleLoaded) {
                onArticleLoaded(payload.article as GeneratedArticleData);
            }
            setNotification({
                message: `CAT 已启动 · ${payload?.catSession?.rankBefore ?? catRank.name}`,
                type: "success",
            });
            setTimeout(() => setNotification(null), 2600);
        } catch (error) {
            setCatStartError(error instanceof Error ? error.message : "启动 CAT 训练失败。");
        } finally {
            setIsStartingCat(false);
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

    const handleSelectArticle = async (link: string) => {
        if (loadingArticleLink) return;
        setLoadingArticleLink(link);
        try {
            await Promise.resolve(onSelect(link));
        } finally {
            setLoadingArticleLink(null);
        }
    };

    return (
        <motion.div
            className="mx-auto w-full max-w-6xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
            <LiquidGlassPanel className="mb-6 rounded-[26px] p-4 md:p-5">
                <div className="flex flex-col gap-4">
                    <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <h3 className="font-welcome-ui text-[1.45rem] font-semibold leading-none tracking-tight text-slate-900 md:text-[1.68rem]">
                            阅读流
                            </h3>
                            <p className="mt-1.5 text-sm text-slate-600">
                                按新鲜度优先，保持阅读上下文连续。
                            </p>
                        </div>

                        {category === "cat_mode" ? null : (
                            <div className="relative flex items-center gap-2 self-start rounded-2xl border border-white/65 bg-white/36 p-1.5 backdrop-blur-xl">
                                {category !== "ai_gen" ? (
                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-white/55 hover:text-slate-800"
                                        title="设置抓取数量"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                    </button>
                                ) : null}
                                <button
                                    onClick={handleRefresh}
                                    disabled={isFetching}
                                    className="inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-slate-700 transition-all hover:bg-white/55 disabled:opacity-50"
                                    title={category === "ai_gen" ? "刷新 AI 历史" : `刷新 ${category} 文章`}
                                >
                                    <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                                    {category === "ai_gen" ? "刷新历史" : `抓取 ${fetchCount} 篇`}
                                </button>

                                <AnimatePresence>
                                    {showSettings && category !== "ai_gen" && (
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
                        )}
                    </div>

                    <div className="grid min-w-0 grid-cols-2 gap-1.5 rounded-2xl border border-white/65 bg-white/28 p-1.5 md:grid-cols-4">
                        {([
                            { id: 'psychology', label: '心理学' },
                            { id: 'ai_news', label: 'AI 资讯' },
                            { id: 'ai_gen', label: 'AI 生成' },
                            { id: 'cat_mode', label: 'CAT 成长' },
                        ] as Array<{ id: FeedCategory; label: string }>).map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setShowSettings(false);
                                    setCatStartError(null);
                                    if (tab.id === 'ai_gen' || tab.id === 'cat_mode') {
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
                                    "relative w-full rounded-xl px-4 py-2 text-center text-sm font-semibold tracking-wide transition-all",
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

                    {category === "cat_mode" && catStartError ? (
                        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/75 px-3 py-2 text-sm font-medium text-rose-700">
                            {catStartError}
                        </div>
                    ) : null}

                    {category !== 'ai_gen' && category !== "cat_mode" && (
                        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/65 bg-white/24 p-1.5 md:grid-cols-4">
                            {feedViewModel.filterItems.map((filterItem) => {
                                const Icon = filterItem.icon;
                                const isActive = activeView === filterItem.id;
                                return (
                                    <button
                                        key={filterItem.id}
                                        onClick={() => setActiveView(filterItem.id)}
                                        className={cn(
                                            "relative flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[12px] px-3 py-2 text-sm font-semibold transition-all duration-300",
                                            isActive
                                                ? "text-slate-900"
                                                : "text-slate-600 hover:text-slate-800"
                                        )}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeFeedFilter"
                                                className="absolute inset-0 -z-10 rounded-[12px] border border-white/75 bg-white/72 shadow-[0_14px_24px_-18px_rgba(15,23,42,0.7)] backdrop-blur-xl"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.55 }}
                                            />
                                        )}
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
                    )}
                </div>
            </LiquidGlassPanel>

            {category === 'ai_gen' ? (
                <div className="space-y-6">
                    <LiquidGlassPanel className="relative overflow-hidden rounded-[30px] p-5 md:p-6">
                        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-fuchsia-300/20 blur-3xl" />
                        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-amber-300/18 blur-3xl" />

                        <div className="relative space-y-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">AI Studio</p>
                                    <h4 className="mt-1 font-newsreader text-[1.5rem] font-semibold leading-tight text-slate-900 md:text-[1.7rem]">
                                        智能写作台
                                    </h4>
                                    <p className="mt-1 text-sm text-slate-600">难度、主题、生成合并为一个连续工作流。</p>
                                </div>
                                <motion.div
                                    animate={{ opacity: [0.72, 1, 0.72] }}
                                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/45 text-violet-600 backdrop-blur-xl"
                                >
                                    <Sparkles className="h-5 w-5" />
                                </motion.div>
                            </div>

                            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                                {([
                                    {
                                        id: 'cet4' as const,
                                        label: 'CET-4 四级',
                                        desc: '4000 词汇 · 300-400 词',
                                        detail: '简单句为主，日常话题',
                                        icon: BookOpen,
                                        activeClass: 'border-emerald-300/90 bg-emerald-50/65 text-emerald-900 shadow-[0_18px_35px_-22px_rgba(16,185,129,0.5)]',
                                        iconClass: 'bg-emerald-100/90 text-emerald-700',
                                    },
                                    {
                                        id: 'cet6' as const,
                                        label: 'CET-6 六级',
                                        desc: '6000 词汇 · 400-500 词',
                                        detail: '复合句+被动语态',
                                        icon: Cpu,
                                        activeClass: 'border-sky-300/90 bg-sky-50/65 text-sky-900 shadow-[0_18px_35px_-22px_rgba(14,165,233,0.5)]',
                                        iconClass: 'bg-sky-100/90 text-sky-700',
                                    },
                                    {
                                        id: 'ielts' as const,
                                        label: 'IELTS 雅思',
                                        desc: '8000+ 词汇 · 500-700 词',
                                        detail: '学术词汇+复杂句式',
                                        icon: Brain,
                                        activeClass: 'border-violet-300/90 bg-violet-50/65 text-violet-900 shadow-[0_18px_35px_-22px_rgba(139,92,246,0.5)]',
                                        iconClass: 'bg-violet-100/90 text-violet-700',
                                    },
                                ]).map((diff) => {
                                    const Icon = diff.icon;
                                    const isActive = genDifficulty === diff.id;
                                    return (
                                        <motion.button
                                            key={diff.id}
                                            type="button"
                                            onClick={() => setGenDifficulty(diff.id)}
                                            whileHover={{ y: -2 }}
                                            whileTap={{ scale: 0.99 }}
                                            className={cn(
                                                "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-350",
                                                isActive
                                                    ? diff.activeClass
                                                    : "border-white/65 bg-white/42 text-slate-700 hover:border-white/80 hover:bg-white/58 hover:shadow-[0_16px_30px_-20px_rgba(15,23,42,0.42)]"
                                            )}
                                        >
                                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0)_56%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
                                            <div className="relative">
                                                <div className={cn(
                                                    "mb-3 inline-flex rounded-xl p-2.5 transition-transform duration-300 group-hover:scale-105",
                                                    isActive ? diff.iconClass : "bg-white/65 text-slate-500"
                                                )}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <p className="text-base font-bold leading-tight">{diff.label}</p>
                                                <p className="mt-1 text-xs font-medium text-slate-600">{diff.desc}</p>
                                                <p className="mt-0.5 text-[11px] text-slate-500">{diff.detail}</p>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            <div className="rounded-2xl border border-white/70 bg-white/30 p-3.5 backdrop-blur-xl md:p-4">
                                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-slate-800">主题选择</h5>
                                    {genTopic.trim() && (
                                        <span className={cn(
                                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                            genDifficulty === 'cet4' && "border-emerald-200/80 bg-emerald-100/75 text-emerald-700",
                                            genDifficulty === 'cet6' && "border-sky-200/80 bg-sky-100/75 text-sky-700",
                                            genDifficulty === 'ielts' && "border-violet-200/80 bg-violet-100/75 text-violet-700"
                                        )}>
                                            {genDifficulty === 'cet4' ? '四级' : genDifficulty === 'cet6' ? '六级' : '雅思'} · {genTopic}
                                        </span>
                                    )}
                                </div>

                                <div className="mb-3 flex flex-wrap gap-2">
                                    {(PRESET_TOPICS[genDifficulty] || []).map(topic => (
                                        <motion.button
                                            key={topic}
                                            type="button"
                                            onClick={() => setGenTopic(topic)}
                                            whileHover={{ y: -1, scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className={cn(
                                                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-250",
                                                genTopic === topic
                                                    ? "border-slate-300/90 bg-white/82 text-slate-900 shadow-[0_9px_18px_-14px_rgba(15,23,42,0.7)]"
                                                    : "border-white/65 bg-white/50 text-slate-600 hover:border-white/85 hover:bg-white/72 hover:text-slate-800"
                                            )}
                                        >
                                            {topic}
                                        </motion.button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[1fr_auto]">
                                    <input
                                        type="text"
                                        value={genTopic}
                                        onChange={(e) => setGenTopic(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                                        placeholder="输入主题（留空则随机），例如：Quantum Computing"
                                        className="w-full rounded-xl border border-white/75 bg-white/58 px-4 py-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all placeholder:text-slate-400 focus:border-cyan-300/80 focus:bg-white/72 focus:outline-none"
                                    />
                                    <motion.button
                                        type="button"
                                        onClick={handleGenerate}
                                        disabled={isGenerating}
                                        whileHover={isGenerating ? undefined : { y: -1, scale: 1.01 }}
                                        whileTap={isGenerating ? undefined : { scale: 0.99 }}
                                        className={cn(
                                            "group relative overflow-hidden rounded-xl px-5 py-3 text-sm font-bold transition-all duration-300",
                                            isGenerating
                                                ? "cursor-not-allowed border border-white/45 bg-white/34 text-slate-400"
                                                : "border border-white/80 bg-white/72 text-slate-800 shadow-[0_15px_28px_-18px_rgba(15,23,42,0.74)] hover:bg-white/90 hover:shadow-[0_20px_38px_-18px_rgba(15,23,42,0.85)]"
                                        )}
                                    >
                                        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0)_18%,rgba(255,255,255,0.5)_50%,rgba(255,255,255,0)_78%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                        <span className="relative flex items-center gap-2">
                                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                            {isGenerating ? "正在生成..." : "生成文章"}
                                        </span>
                                    </motion.button>
                                </div>
                            </div>
                        </div>
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
                                            onSelect={handleSelectArticle}
                                            onDelete={handleDelete}
                                            isLoading={loadingArticleLink === item.link}
                                            isAnyLoading={Boolean(loadingArticleLink)}
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </div>
            ) : category === "cat_mode" ? (
                <div className="space-y-6">
                    <LiquidGlassPanel className="relative overflow-hidden rounded-[34px] p-5 md:p-6">
                        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-violet-300/22 blur-3xl" />
                        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-cyan-300/18 blur-3xl" />

                        <div className="relative space-y-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h4 className="font-welcome-ui text-[1.5rem] font-semibold tracking-tight text-slate-900 md:text-[1.72rem]">
                                        CAT 自适应训练
                                    </h4>
                                    <p className="mt-1 text-sm text-slate-600">一局一篇，按表现自动调节难度。</p>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/54 px-3 py-2 text-sm font-semibold text-slate-800 shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] backdrop-blur-2xl">
                                    <span className="text-base leading-none">{getCatRankIconByTierId(catRank.id)}</span>
                                    <span>{catRank.name}</span>
                                    <span className="rounded-lg border border-white/70 bg-white/72 px-2 py-0.5 text-xs font-bold text-slate-700">{catScore}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
                                <button
                                    type="button"
                                    onClick={() => setIsCatRankOverviewOpen((prev) => !prev)}
                                    className="w-full rounded-2xl border border-white/70 bg-white/44 px-3.5 py-3 text-left transition-all hover:bg-white/62"
                                >
                                    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
                                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/80 bg-white/72 text-xl shadow-[0_12px_20px_-16px_rgba(15,23,42,0.45)]">
                                            {getCatRankIconByTierId(catRank.id)}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-900">{catRank.primaryLabel}</p>
                                            <p className="truncate text-xs text-slate-500">{catRank.secondaryLabel}</p>
                                        </div>
                                        <div className="rounded-xl border border-white/70 bg-white/72 px-3 py-2 text-right">
                                            <p className="text-[10px] text-slate-500">下一段</p>
                                            <p className="text-sm font-semibold text-slate-900">
                                                {catScoreToNextRank > 0 ? `还差 ${catScoreToNextRank} 分` : "已到顶段"}
                                            </p>
                                        </div>
                                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/75 text-slate-600">
                                            <ChevronDown
                                                className={cn(
                                                    "h-4 w-4 transition-transform duration-300",
                                                    isCatRankOverviewOpen && "rotate-180",
                                                )}
                                            />
                                        </span>
                                    </div>
                                </button>

                                <div className="rounded-2xl border border-white/70 bg-white/44 p-2.5">
                                    <p className="px-1 text-xs font-semibold text-slate-600">训练主题（可选）</p>
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                                        <input
                                            type="text"
                                            value={catTopic}
                                            onChange={(event) => setCatTopic(event.target.value)}
                                            onKeyDown={(event) => event.key === "Enter" && handleStartCatSession()}
                                            placeholder="例如：睡眠与记忆、AI 与教育"
                                            className="w-full rounded-xl border border-white/75 bg-white/64 px-4 py-2.5 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all placeholder:text-slate-400 focus:border-violet-300/80 focus:bg-white/78 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleStartCatSession}
                                            disabled={isStartingCat}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/76 px-4 py-2.5 text-sm font-bold text-slate-800 shadow-[0_15px_28px_-18px_rgba(15,23,42,0.74)] transition-all hover:bg-white/92 disabled:opacity-50"
                                        >
                                            {isStartingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                                            {isStartingCat ? "生成中..." : "开始训练"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <AnimatePresence initial={false}>
                                {isCatRankOverviewOpen && (
                                    <motion.div
                                        key="cat-rank-overview"
                                        initial={{ opacity: 0, height: 0, y: -8 }}
                                        animate={{ opacity: 1, height: "auto", y: 0 }}
                                        exit={{ opacity: 0, height: 0, y: -8 }}
                                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="rounded-2xl border border-white/70 bg-white/40 p-3">
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {CAT_RANK_TIERS.map((tier) => {
                                                    const isActive = tier.id === catRank.id;
                                                    return (
                                                        <div
                                                            key={tier.id}
                                                            className={cn(
                                                                "rounded-xl border px-3 py-2.5 transition-all",
                                                                isActive
                                                                    ? "border-violet-300/85 bg-violet-100/72 shadow-[0_12px_20px_-14px_rgba(124,58,237,0.45)]"
                                                                    : "border-white/65 bg-white/60",
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base leading-none">{getCatRankIconByTierId(tier.id)}</span>
                                                                <span className="text-xs font-semibold text-slate-800">{tier.name}</span>
                                                            </div>
                                                            <p className="mt-1 text-[10px] text-slate-500">
                                                                {tier.maxScore === null ? `${tier.minScore}+` : `${tier.minScore}-${tier.maxScore}`}
                                                            </p>
                                                            <p className="mt-1 text-[11px] font-semibold text-slate-700">{tier.primaryLabel}</p>
                                                            <p className="text-[11px] text-slate-500">{tier.secondaryLabel}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <CatGrowthChart currentScore={catScore} />
                        </div>
                    </LiquidGlassPanel>
                </div>
            ) : (
                <div className="space-y-8">
                    {articles.length === 0 && (
                        <LiquidGlassPanel className="rounded-[24px] py-16 text-center text-sm italic text-slate-500">
                            点击刷新按钮抓取文章 / Click refresh to fetch articles
                        </LiquidGlassPanel>
                    )}

                    {articles.length > 0 && (
                        <div className="space-y-6">
                            {feedViewModel.filteredArticles.length === 0 ? (
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
                                    {feedViewModel.filteredArticles.map((item) => (
                                        <motion.div
                                            key={item.link}
                                            variants={listItemVariants}
                                        >
                                            <ArticleCard
                                                item={item}
                                                status={feedViewModel.statusByLink.get(item.link) ?? 'unread'}
                                                category={category}
                                                onSelect={handleSelectArticle}
                                                onDelete={handleDelete}
                                                isLoading={loadingArticleLink === item.link}
                                                isAnyLoading={Boolean(loadingArticleLink)}
                                            />
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </div>
                    )}
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
function ArticleCard({ item, status, category, onSelect, onDelete, isLoading = false, isAnyLoading = false }: {
    item: ArticleItem,
    status: ArticleStatus,
    category: FeedCategory,
    onSelect: (url: string) => void,
    onDelete: (url: string) => void,
    isLoading?: boolean,
    isAnyLoading?: boolean,
}) {
    const isRead = status === 'read';
    const statusMeta = status === 'new'
        ? { label: '新到达', className: 'border-amber-200/80 bg-amber-100/80 text-amber-700' }
        : status === 'read'
            ? { label: '已读', className: 'border-emerald-200/80 bg-emerald-100/80 text-emerald-700' }
            : { label: '未读', className: 'border-slate-200/80 bg-white/75 text-slate-600' };
    const sourceLabel = category === "ai_gen" ? "AI Studio" : item.source;

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
            onClick={() => {
                if (isAnyLoading) return;
                onSelect(item.link);
            }}
            className={cn(
                "group relative flex h-[348px] cursor-pointer flex-col overflow-hidden rounded-[24px] transition-all duration-500 md:h-[376px] [&>.liquid-glass-content]:h-full [&>.liquid-glass-content]:w-full",
                isAnyLoading && !isLoading && "opacity-75",
                isRead
                    ? "shadow-[0_14px_32px_-26px_rgba(15,23,42,0.68)]"
                    : "hover:shadow-[0_28px_48px_-26px_rgba(15,23,42,0.95)]"
            )}
        >
            <div className="relative h-full w-full">
                <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(120deg,rgba(255,255,255,0)_18%,rgba(255,255,255,0.14)_46%,rgba(255,255,255,0)_72%)] opacity-35" />
                <div className="absolute inset-0 overflow-hidden bg-slate-100">
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover object-center transition-transform duration-700 ease-in-out will-change-transform group-hover:scale-[1.02]"
                        onError={(e) => {
                            // On error, show gradient fallback
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                    />
                ) : (
                    <>
                        <img
                            src={`https://picsum.photos/seed/${encodeURIComponent(item.title.slice(0, 20))}/800/600`}
                            alt=""
                            className="h-full w-full object-cover object-center transition-transform duration-700 ease-in-out will-change-transform group-hover:scale-[1.02]"
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

                        <div
                            data-fallback
                            className={cn(
                                "w-full h-full absolute inset-0 hidden",
                                getGradient(item.title)
                            )}
                        />

                    </>
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 via-black/14 to-transparent" />
                <div className="pointer-events-none absolute inset-x-10 bottom-[142px] h-10 rounded-full bg-[linear-gradient(90deg,rgba(125,211,252,0.3),rgba(255,255,255,0.2),rgba(191,219,254,0.3))] blur-xl opacity-90 transition-all duration-700 group-hover:opacity-100" />

                <div className={cn(
                    "w-full h-full absolute top-0 left-0 hidden",
                    getGradient(item.title)
                )} />

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

                <div className="absolute inset-x-0 bottom-0 z-30 h-[44%] min-h-[150px] max-h-[176px] overflow-hidden border-t border-white/30 bg-white/12 px-4 pt-3 backdrop-blur-[30px] backdrop-saturate-[2.2] md:px-5 md:pt-4">
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(216,232,252,0.38)_0%,rgba(173,207,245,0.2)_44%,rgba(146,185,234,0.28)_100%)]" />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.02)_30%,rgba(15,23,42,0.05)_100%)]" />
                    <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-22px_34px_-24px_rgba(30,58,138,0.52),inset_0_0_0_1px_rgba(255,255,255,0.18)]" />
                    <div className="pointer-events-none absolute left-0 top-0 h-full w-[34%] bg-[linear-gradient(96deg,rgba(186,230,253,0.34),rgba(255,255,255,0.02))] blur-xl opacity-90" />
                    <div className="pointer-events-none absolute right-0 top-0 h-full w-[32%] bg-[linear-gradient(264deg,rgba(191,219,254,0.3),rgba(255,255,255,0.03))] blur-xl opacity-90" />
                    <div className="pointer-events-none absolute inset-x-10 top-7 h-7 rounded-full bg-[linear-gradient(90deg,rgba(224,242,254,0.52),rgba(255,255,255,0.26),rgba(219,234,254,0.48))] blur-lg opacity-95" />
                    <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay bg-[radial-gradient(circle_at_18%_24%,rgba(255,255,255,0.35)_0%,transparent_48%),radial-gradient(circle_at_84%_72%,rgba(191,219,254,0.3)_0%,transparent_52%)]" />
                    <div className="relative z-10 flex h-full flex-col gap-3.5 pb-3 md:pb-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600/95">
                                {sourceLabel}
                            </span>
                            <span className="text-[11px] font-medium text-slate-600">
                                {formatArticleDate(item)}
                            </span>
                        </div>

                        <h4 className={cn(
                            "line-clamp-3 font-newsreader text-[1.34rem] font-semibold leading-[1.06] tracking-[-0.018em] transition-colors md:text-[1.48rem]",
                            isRead ? "text-slate-700" : "text-slate-900 group-hover:text-slate-800"
                        )}>
                            {item.title}
                        </h4>

                        <div className="mt-auto flex items-center justify-end">
                            <span className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-300",
                                isLoading
                                    ? "border-slate-200/80 bg-white/82 text-slate-700"
                                    : isRead
                                    ? "border-slate-200/70 bg-white/65 text-slate-500 group-hover:border-slate-300 group-hover:text-slate-700"
                                    : "border-cyan-200/80 bg-cyan-50/82 text-cyan-700 group-hover:-translate-y-0.5 group-hover:border-cyan-300 group-hover:bg-cyan-100/85 group-hover:text-cyan-800"
                            )}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        正在加载中
                                    </>
                                ) : (
                                    <>
                                        {isRead ? "继续阅读" : "进入文章"} <ExternalLink className="h-3 w-3" />
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>


        </LiquidGlassPanel>
    );
}
