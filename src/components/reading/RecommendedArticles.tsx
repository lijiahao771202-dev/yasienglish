"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, ExternalLink, Loader2, BookOpen, Cpu, Sparkles, Send, RefreshCw, Trash2, Check, Settings2, LayoutGrid, ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFeedStore } from "@/lib/feed-store";
import { useUserStore } from "@/lib/store";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getPressableStyle, getPressableTap } from "@/lib/pressable";
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
    difficulty?: 'cet4' | 'cet6' | 'ielts';
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
    image?: string | null;
    timestamp: number;
    difficulty?: 'cet4' | 'cet6' | 'ielts';
    isAIGenerated?: boolean;
    isCatMode?: boolean;
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

function mergeFeedArticles(existingArticles: ArticleItem[], fetchedArticles: ArticleItem[]): ArticleItem[] {
    const existingByLink = new Map(existingArticles.map((article) => [article.link, article]));

    const refreshedArticles = fetchedArticles.map((article) => {
        const existing = existingByLink.get(article.link);
        if (!existing) return article;

        return {
            ...existing,
            ...article,
            title: article.title || existing.title,
            source: article.source || existing.source,
            snippet: article.snippet || existing.snippet,
            image: article.image ?? existing.image,
            difficulty: article.difficulty ?? existing.difficulty,
            pubDate: article.pubDate || existing.pubDate,
            fetchedAt: article.fetchedAt ?? existing.fetchedAt,
            quizCompleted: article.quizCompleted ?? existing.quizCompleted,
            quizCorrect: article.quizCorrect ?? existing.quizCorrect,
            quizTotal: article.quizTotal ?? existing.quizTotal,
            quizScorePercent: article.quizScorePercent ?? existing.quizScorePercent,
        };
    });

    const appendedExisting = existingArticles.filter((article) => !refreshedArticles.some((candidate) => candidate.link === article.link));
    return uniqueByLink(sortByNewest([...refreshedArticles, ...appendedExisting]));
}

function formatArticleDate(article: ArticleItem): string {
    const timestamp = getArticleTimestamp(article);
    if (!timestamp) {
        return "未知日期";
    }

    return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function getDifficultyBadgeMeta(difficulty?: ArticleItem["difficulty"]) {
    if (difficulty === "cet4") {
        return {
            label: "四级",
            className: "border-emerald-200/80 bg-emerald-100/80 text-emerald-700",
        };
    }
    if (difficulty === "cet6") {
        return {
            label: "六级",
            className: "border-sky-200/80 bg-sky-100/80 text-sky-700",
        };
    }
    if (difficulty === "ielts") {
        return {
            label: "雅思",
            className: "border-violet-200/80 bg-violet-100/80 text-violet-700",
        };
    }
    return null;
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
    const prefersReducedMotion = useReducedMotion();
    const silentImageHydrationRef = useRef<Record<string, boolean>>({});
    const [articles, setArticles] = useState<ArticleItem[]>([]);
    const [category, setCategory] = useState<FeedCategory>('cat_mode');
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
    const syncVisibleArticles = useCallback((nextArticles: ArticleItem[]) => {
        setArticles(nextArticles);
        if (onListUpdate) {
            onListUpdate(nextArticles);
        }
    }, [onListUpdate]);
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

    const loadAIGenHistory = useCallback(async () => {
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
                image: row.image ?? undefined,
                difficulty: row.difficulty,
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
    }, [onListUpdate]);

    const loadCatHistory = useCallback(async () => {
        try {
            const { db } = await import("@/lib/db");
            const rows = (await db.articles
                .toArray() as unknown as AIGenHistoryRecord[])
                .filter((row) => Boolean(row.isCatMode) || row.url.startsWith("cat://"))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            const historyItems: ArticleItem[] = rows.map((row) => ({
                title: row.title || "CAT 训练文章",
                link: row.url,
                pubDate: new Date(row.timestamp || Date.now()).toISOString(),
                source: "CAT",
                snippet: (row.textContent || row.content || "").slice(0, 180),
                image: row.image ?? undefined,
                difficulty: row.difficulty,
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
            console.error("Failed to load CAT history:", error);
            setArticles([]);
            if (onListUpdate) onListUpdate([]);
        }
    }, [onListUpdate]);

    const refreshStandardFeed = useCallback(async (
        selectedCategory: Extract<FeedCategory, "psychology" | "ai_news">,
        options?: {
            silent?: boolean;
            baseArticles?: ArticleItem[];
        },
    ) => {
        const silent = options?.silent ?? false;
        const baseArticles = options?.baseArticles ?? articles;

        if (!silent) {
            setIsFetching(true);
        }

        try {
            const res = await fetch(`/api/feed?category=${selectedCategory}&count=${fetchCount}&t=${Date.now()}`);
            const data: unknown = await res.json();
            if (!Array.isArray(data)) return;

            const fetchedAt = Date.now();
            const fetchedArticles = data
                .filter(isArticleItem)
                .slice(0, fetchCount)
                .map((item) => ({
                    ...item,
                    pubDate: item.pubDate || new Date(fetchedAt).toISOString(),
                    fetchedAt: item.fetchedAt ?? fetchedAt,
                }));

            const existingByLink = new Map(baseArticles.map((article) => [article.link, article]));
            const uniqueNewCount = fetchedArticles.filter((article) => !existingByLink.has(article.link)).length;
            const recoveredImageCount = fetchedArticles.filter((article) => {
                const existing = existingByLink.get(article.link);
                return Boolean(existing && !existing.image && article.image);
            }).length;
            const mergedArticles = mergeFeedArticles(baseArticles, fetchedArticles);

            syncVisibleArticles(mergedArticles);
            await setFeed(selectedCategory, mergedArticles);

            if (!silent) {
                if (uniqueNewCount > 0) {
                    setNotification({
                        message: `成功抓取 ${uniqueNewCount} 篇新文章`,
                        type: 'success'
                    });
                } else if (recoveredImageCount > 0) {
                    setNotification({
                        message: `已补全 ${recoveredImageCount} 张文章封面`,
                        type: 'success'
                    });
                } else {
                    setNotification({
                        message: "暂时没有发现新文章",
                        type: 'info'
                    });
                }
            }
        } catch (error) {
            console.error("Refresh error:", error);
            if (!silent) {
                setNotification({ message: "抓取失败，请稍后重试", type: 'info' });
            }
        } finally {
            if (!silent) {
                setIsFetching(false);
                setTimeout(() => setNotification(null), 3000);
            }
        }
    }, [articles, fetchCount, setFeed, syncVisibleArticles]);

    // Load from DB only (no auto-fetch from API)
    useEffect(() => {
        if (category === 'cat_mode') {
            loadCatHistory();
            return;
        }

        if (category === 'ai_gen') {
            loadAIGenHistory();
            return;
        }

        // Only load from DB/memory - NO auto-fetch
        loadFeedFromDB(category).then(() => {
            const cachedFeeds = sortByNewest(getFeed(category) ?? []);
            if (cachedFeeds.length > 0) {
                syncVisibleArticles(cachedFeeds);
            } else {
                syncVisibleArticles([]);
            }

            const needsImageHydration = cachedFeeds.length > 0
                && cachedFeeds.some((article) => !article.image)
                && !silentImageHydrationRef.current[category];

            if (needsImageHydration) {
                silentImageHydrationRef.current[category] = true;
                void refreshStandardFeed(category, { silent: true, baseArticles: cachedFeeds });
            }
        });
    }, [category, getFeed, loadAIGenHistory, loadCatHistory, loadFeedFromDB, refreshStandardFeed, syncVisibleArticles]);

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
                    image: typeof data.image === "string" ? data.image : undefined,
                    difficulty: genDifficulty,
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
        await refreshStandardFeed(category, { baseArticles: articles });
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
        if (category === 'ai_gen' || category === "cat_mode") {
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

    const shellCardClass = "rounded-[30px] border-4 border-[#d8d3cb] bg-white shadow-[0_12px_0_0_#d8d3cb]";
    const insetCardClass = "rounded-[24px] border-4 border-[#ebe6de] bg-[#fffdf8]";
    const utilityButtonClass = "ui-pressable inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[#d8d3cb] bg-white px-4 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
    const tabItems: Array<{ id: FeedCategory; label: string }> = [
        { id: "cat_mode", label: "CAT 成长" },
        { id: "ai_gen", label: "AI 生成" },
        { id: "psychology", label: "心理学" },
        { id: "ai_news", label: "AI 资讯" },
    ];
    const panelTransition = {
        duration: prefersReducedMotion ? 0.16 : 0.44,
        ease: [0.22, 1, 0.36, 1] as const,
    };
    const panelEnter = prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: 18, scale: 0.992, filter: "blur(12px)" };
    const panelExit = prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: -12, scale: 0.99, filter: "blur(10px)" };

    return (
        <motion.div
            className="mx-auto w-full max-w-[1180px]"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.994, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: prefersReducedMotion ? 0.16 : 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
            <motion.div
                layout
                transition={{ layout: panelTransition, duration: panelTransition.duration, ease: panelTransition.ease }}
                className="relative mb-6 overflow-hidden rounded-[34px] border-4 border-[#d8d3cb] bg-[#eaf2ff] px-5 py-5 shadow-[0_12px_0_0_#d8d3cb] md:px-6 md:py-6"
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.48),rgba(255,255,255,0))]" />
                <div className="pointer-events-none absolute -left-10 top-8 h-24 w-24 rounded-full bg-[#bfdbfe]/55 blur-3xl" />
                <div className="pointer-events-none absolute right-16 top-8 hidden h-28 w-28 rounded-full bg-[#dbeafe]/75 blur-3xl md:block" />

                <motion.div
                    layout
                    transition={{ layout: panelTransition, duration: panelTransition.duration, ease: panelTransition.ease }}
                    className="relative flex flex-col gap-5"
                >
                    <motion.div
                        layout
                        transition={{ layout: panelTransition, duration: panelTransition.duration, ease: panelTransition.ease }}
                        className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
                    >
                        <div className="max-w-2xl">
                            <p className="inline-flex items-center gap-2 rounded-full border-2 border-[#d8d3cb] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#2563eb]">
                                <Sparkles className="h-3.5 w-3.5" />
                                Reading Flow
                            </p>
                            <h3 className="mt-3 font-welcome-display text-[2.3rem] font-black leading-[0.92] tracking-[-0.05em] text-[#111827] md:text-[3rem]">
                                阅读流
                            </h3>
                            <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600">
                                按新鲜度优先，保持阅读上下文连续。把训练、生成和资讯入口收进一个更可爱的阅读工作台里。
                            </p>
                        </div>

                        <AnimatePresence initial={false} mode="wait">
                            {category === "cat_mode" ? null : (
                                <motion.div
                                    key={`toolbar-${category}`}
                                    layout
                                    initial={panelEnter}
                                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                    exit={panelExit}
                                    transition={panelTransition}
                                    className="relative flex flex-wrap items-center gap-2"
                                >
                                    {category !== "ai_gen" ? (
                                        <button
                                            onClick={() => setShowSettings(!showSettings)}
                                            className={utilityButtonClass}
                                            style={getPressableStyle("#d8d3cb", 4)}
                                            title="设置抓取数量"
                                        >
                                            <Settings2 className="h-4 w-4" />
                                            数量 {fetchCount}
                                        </button>
                                    ) : null}
                                    <button
                                        onClick={handleRefresh}
                                        disabled={isFetching}
                                        className={cn(utilityButtonClass, "border-[#bfdbfe] text-[#1d4ed8] shadow-[0_4px_0_0_#bfdbfe]")}
                                        style={getPressableStyle("#bfdbfe", 4)}
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
                                                className="absolute right-0 top-full z-50 mt-3 rounded-[22px] border-4 border-[#d8d3cb] bg-white p-3 shadow-[0_10px_0_0_#d8d3cb]"
                                            >
                                                <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">抓取数量</div>
                                                <div className="flex gap-2">
                                                    {[1, 2, 3, 4, 5].map((count) => (
                                                        <button
                                                            key={count}
                                                            onClick={() => {
                                                                setFetchCount(count);
                                                                setShowSettings(false);
                                                            }}
                                                            className={cn(
                                                                "ui-pressable rounded-full border-2 px-3 py-1.5 text-xs font-black",
                                                                fetchCount === count
                                                                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                                                                    : "border-[#d8d3cb] bg-[#fffdf8] text-slate-600"
                                                            )}
                                                            style={getPressableStyle(fetchCount === count ? "#1d4ed8" : "#d8d3cb", 4)}
                                                        >
                                                            {count}
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    <div className="grid gap-3 rounded-[28px] border-4 border-[#d8d3cb] bg-white p-2 md:grid-cols-4">
                        {tabItems.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setShowSettings(false);
                                    setCatStartError(null);
                                    if (tab.id === "ai_gen" || tab.id === "cat_mode") {
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
                                    "ui-pressable relative overflow-hidden rounded-full px-4 py-3 text-center text-sm font-black tracking-wide",
                                    category === tab.id
                                        ? "text-white"
                                        : "bg-[#fffdf8] text-slate-500 hover:text-slate-700"
                                )}
                                style={getPressableStyle(category === tab.id ? "#1d4ed8" : "#d8d3cb", 4)}
                            >
                                {category === tab.id ? (
                                    <motion.span
                                        layoutId="read-category-pill"
                                        className="absolute inset-0 rounded-full bg-[#2563eb] shadow-[0_6px_0_0_#1d4ed8]"
                                        transition={panelTransition}
                                    />
                                ) : null}
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <AnimatePresence initial={false}>
                        {category !== "ai_gen" && category !== "cat_mode" && (
                            <motion.div
                                key="feed-view-filters"
                                layout
                                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -10, filter: "blur(8px)" }}
                                animate={{ opacity: 1, height: "auto", y: 0, filter: "blur(0px)" }}
                                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -10, filter: "blur(8px)" }}
                                transition={panelTransition}
                                className="overflow-hidden"
                            >
                                <div className="grid gap-3 rounded-[28px] border-4 border-[#d8d3cb] bg-white p-2 md:grid-cols-4">
                                    {feedViewModel.filterItems.map((filterItem) => {
                                        const Icon = filterItem.icon;
                                        const isActive = activeView === filterItem.id;
                                        return (
                                            <button
                                                key={filterItem.id}
                                                onClick={() => setActiveView(filterItem.id)}
                                                className={cn(
                                                    "ui-pressable relative flex min-h-[48px] items-center justify-center gap-2 overflow-hidden rounded-full px-3 py-2 text-sm font-black",
                                                    isActive
                                                        ? "text-white"
                                                        : "bg-[#fffdf8] text-slate-600 hover:text-slate-800"
                                                )}
                                                style={getPressableStyle(isActive ? "#374151" : "#d8d3cb", 4)}
                                            >
                                                {isActive ? (
                                                    <motion.span
                                                        layoutId="read-view-pill"
                                                        className="absolute inset-0 rounded-full bg-[#111827] shadow-[0_6px_0_0_#374151]"
                                                        transition={panelTransition}
                                                    />
                                                ) : null}
                                                <span className="relative z-10 flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    <span>{filterItem.label}</span>
                                                    <span className={cn(
                                                        "rounded-full px-2 py-0.5 text-[10px] font-black",
                                                        isActive ? "bg-white/20 text-white" : "bg-[#eef2ff] text-[#4338ca]"
                                                    )}>
                                                        {filterItem.count}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </motion.div>

            {category === "cat_mode" && catStartError ? (
                <div className="mb-5 rounded-[24px] border-4 border-[#fecaca] bg-[#fff1f2] px-5 py-3 text-sm font-semibold text-rose-700 shadow-[0_8px_0_0_#fecaca]">
                    {catStartError}
                </div>
            ) : null}

            <AnimatePresence mode="wait" initial={false}>
                {category === 'ai_gen' ? (
                <motion.div
                    key="board-ai-gen"
                    className="space-y-6"
                    initial={panelEnter}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={panelExit}
                    transition={panelTransition}
                >
                    <section className={cn(shellCardClass, "p-5 md:p-6")}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748b]">AI Studio</p>
                                <h4 className="mt-2 font-welcome-display text-[2rem] font-black leading-[0.95] tracking-[-0.04em] text-[#111827]">
                                    智能写作台
                                </h4>
                                <p className="mt-2 text-sm font-medium text-slate-600">把难度、主题和生成合并为一个连续工作流。</p>
                            </div>
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#c4b5fd] bg-[#ede9fe] text-[#6d28d9] shadow-[0_4px_0_0_#c4b5fd]">
                                <Sparkles className="h-5 w-5" />
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
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
                                            whileTap={getPressableTap(prefersReducedMotion, 6, 0.985)}
                                            style={getPressableStyle("#d8d3cb", 6)}
                                            className={cn(
                                                "ui-pressable group relative overflow-hidden rounded-[24px] border-4 p-4 text-left transition-all duration-350",
                                                isActive
                                                    ? cn(diff.activeClass, "border-[#d8d3cb]")
                                                    : "border-[#d8d3cb] bg-[#fffdf8] text-slate-700"
                                            )}
                                        >
                                            <div className="relative">
                                                <div className={cn(
                                                    "mb-3 inline-flex rounded-[18px] border-2 border-[#d8d3cb] p-2.5 transition-transform duration-300 group-hover:scale-105",
                                                    isActive ? diff.iconClass : "bg-white text-slate-500"
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

                        <div className={cn(insetCardClass, "mt-5 p-4 md:p-5")}>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <h5 className="text-sm font-black text-slate-800">主题选择</h5>
                                    {genTopic.trim() && (
                                        <span className={cn(
                                            "rounded-full border-2 px-2.5 py-1 text-[11px] font-black",
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
                                            whileTap={getPressableTap(prefersReducedMotion, 4, 0.98)}
                                            style={getPressableStyle(genTopic === topic ? "#374151" : "#d8d3cb", 4)}
                                            className={cn(
                                                "ui-pressable rounded-full border-2 px-3.5 py-1.5 text-xs font-black transition-all duration-250",
                                                genTopic === topic
                                                    ? "border-[#111827] bg-[#111827] text-white"
                                                    : "border-[#d8d3cb] bg-white text-slate-600 hover:text-slate-800"
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
                                        className="w-full rounded-full border-4 border-[#d8d3cb] bg-white px-5 py-3 text-sm font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#93c5fd] focus:outline-none"
                                    />
                                    <motion.button
                                        type="button"
                                        onClick={handleGenerate}
                                        disabled={isGenerating}
                                        whileHover={isGenerating ? undefined : { y: -1, scale: 1.01 }}
                                        whileTap={isGenerating ? undefined : getPressableTap(prefersReducedMotion, 6, 0.985)}
                                        style={getPressableStyle(isGenerating ? "#d8d3cb" : "#1d4ed8", 6)}
                                        className={cn(
                                            "ui-pressable group relative overflow-hidden rounded-full px-5 py-3 text-sm font-black transition-all duration-300 disabled:shadow-none",
                                            isGenerating
                                                ? "cursor-not-allowed border-4 border-[#d8d3cb] bg-[#f8fafc] text-slate-400"
                                                : "border-4 border-[#1d4ed8] bg-[#2563eb] text-white"
                                        )}
                                    >
                                        <span className="relative flex items-center gap-2">
                                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                            {isGenerating ? "正在生成..." : "生成文章"}
                                        </span>
                                    </motion.button>
                                </div>
                            </div>
                    </section>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-sm font-black text-slate-800">历史文章</h4>
                            <span className="text-xs text-slate-500">{articles.length} 篇</span>
                        </div>

                        {articles.length === 0 ? (
                            <div className={cn(shellCardClass, "p-8 text-center text-sm text-slate-500")}>
                                暂无历史文章，先生成一篇试试
                            </div>
                        ) : (
                            <motion.div
                                className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
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
                </motion.div>
            ) : category === "cat_mode" ? (
                <motion.div
                    key="board-cat-mode"
                    className="space-y-6"
                    initial={panelEnter}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={panelExit}
                    transition={panelTransition}
                >
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
                        <section className={cn(shellCardClass, "p-5 md:p-6")}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748b]">Training Console</p>
                                    <h4 className="mt-2 font-welcome-display text-[2rem] font-black tracking-[-0.04em] text-slate-900 md:text-[2.2rem]">
                                        CAT 自适应训练
                                    </h4>
                                    <p className="mt-2 text-sm font-medium text-slate-600">一局一篇，按表现自动调节难度，把入口做成更像首页的可爱训练工作台。</p>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#fdba74] bg-[#ffedd5] px-4 py-2 text-sm font-black text-[#9a3412] shadow-[0_4px_0_0_#fdba74]">
                                    <span className="text-base leading-none">{getCatRankIconByTierId(catRank.id)}</span>
                                    <span>{catRank.name}</span>
                                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700">{catScore}</span>
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1fr]">
                                <button
                                    type="button"
                                    onClick={() => setIsCatRankOverviewOpen((prev) => !prev)}
                                    className={cn("ui-pressable w-full px-4 py-4 text-left", insetCardClass)}
                                    style={getPressableStyle("#ebe6de", 6)}
                                >
                                    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
                                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border-2 border-[#d8d3cb] bg-white text-xl shadow-[0_4px_0_0_#d8d3cb]">
                                            {getCatRankIconByTierId(catRank.id)}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-slate-900">{catRank.primaryLabel}</p>
                                            <p className="truncate text-xs font-medium text-slate-500">{catRank.secondaryLabel}</p>
                                        </div>
                                        <div className="rounded-[18px] border-2 border-[#d8d3cb] bg-white px-3 py-2 text-right">
                                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">下一段</p>
                                            <p className="text-sm font-black text-slate-900">
                                                {catScoreToNextRank > 0 ? `还差 ${catScoreToNextRank} 分` : "已到顶段"}
                                            </p>
                                        </div>
                                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#d8d3cb] bg-white text-slate-600">
                                            <ChevronDown
                                                className={cn(
                                                    "h-4 w-4 transition-transform duration-300",
                                                    isCatRankOverviewOpen && "rotate-180",
                                                )}
                                            />
                                        </span>
                                    </div>
                                </button>

                                <div className={cn(insetCardClass, "p-4")}>
                                    <p className="px-1 text-xs font-black uppercase tracking-[0.12em] text-slate-600">训练主题（可选）</p>
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                                        <input
                                            type="text"
                                            value={catTopic}
                                            onChange={(event) => setCatTopic(event.target.value)}
                                            onKeyDown={(event) => event.key === "Enter" && handleStartCatSession()}
                                            placeholder="例如：睡眠与记忆、AI 与教育"
                                            className="w-full rounded-full border-4 border-[#d8d3cb] bg-white px-4 py-3 text-sm text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#c4b5fd] focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleStartCatSession}
                                            disabled={isStartingCat}
                                            className="ui-pressable inline-flex items-center justify-center gap-2 rounded-full border-4 border-[#1d4ed8] bg-[#2563eb] px-5 py-3 text-sm font-black text-white disabled:opacity-50 disabled:shadow-none"
                                            style={getPressableStyle("#1d4ed8", 6)}
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
                                        <div className={cn(insetCardClass, "mt-4 p-3")}>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {CAT_RANK_TIERS.map((tier) => {
                                                    const isActive = tier.id === catRank.id;
                                                    return (
                                                        <div
                                                            key={tier.id}
                                                            className={cn(
                                                                "rounded-[18px] border-2 px-3 py-2.5 transition-all",
                                                                isActive
                                                                    ? "border-violet-300/85 bg-violet-100/72 shadow-[0_4px_0_0_rgba(196,181,253,1)]"
                                                                    : "border-[#e7e1d7] bg-white",
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base leading-none">{getCatRankIconByTierId(tier.id)}</span>
                                                                <span className="text-xs font-black text-slate-800">{tier.name}</span>
                                                            </div>
                                                            <p className="mt-1 text-[10px] text-slate-500">
                                                                {tier.maxScore === null ? `${tier.minScore}+` : `${tier.minScore}-${tier.maxScore}`}
                                                            </p>
                                                            <p className="mt-1 text-[11px] font-black text-slate-700">{tier.primaryLabel}</p>
                                                            <p className="text-[11px] text-slate-500">{tier.secondaryLabel}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>

                        <CatGrowthChart currentScore={catScore} />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-sm font-black text-slate-800">训练历史</h4>
                            <span className="text-xs text-slate-500">{articles.length} 篇</span>
                        </div>

                        {articles.length === 0 ? (
                            <div className={cn(shellCardClass, "p-8 text-center text-sm text-slate-500")}>
                                暂无 CAT 历史文章，先开始一局训练
                            </div>
                        ) : (
                            <motion.div
                                className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
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
                                            category="cat_mode"
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
                </motion.div>
            ) : (
                <motion.div
                    key={`board-feed-${category}`}
                    className="space-y-8"
                    initial={panelEnter}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={panelExit}
                    transition={panelTransition}
                >
                    {articles.length === 0 && (
                        <div className={cn(shellCardClass, "py-16 text-center text-sm italic text-slate-500")}>
                            点击刷新按钮抓取文章 / Click refresh to fetch articles
                        </div>
                    )}

                    {articles.length > 0 && (
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={`feed-view-${category}-${activeView}-${feedViewModel.filteredArticles.length === 0 ? "empty" : "filled"}`}
                                className="space-y-6"
                                initial={panelEnter}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                exit={panelExit}
                                transition={panelTransition}
                            >
                                {feedViewModel.filteredArticles.length === 0 ? (
                                    <div className={cn(shellCardClass, "p-10 text-center text-sm text-slate-500")}>
                                        这个分组暂时没有文章
                                    </div>
                                ) : (
                                    <motion.div
                                        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
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
                            </motion.div>
                        </AnimatePresence>
                    )}
                </motion.div>
            )}
            </AnimatePresence>

            {/* Notification Toast */}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                        className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border-4 border-[#d8d3cb] bg-white px-5 py-2.5 text-sm font-black tracking-wide text-slate-800 shadow-[0_8px_0_0_#d8d3cb]"
                    >
                        {notification.type === 'success' ? (
                            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]" />
                        ) : (
                            <div className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
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
    const imageUrl = typeof item.image === "string" && item.image.trim().length > 0 ? item.image.trim() : null;
    const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

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
    const fallbackGradient = getGradient(item.title || item.link);
    const resolvedImageUrl = imageUrl && failedImageUrl !== imageUrl ? imageUrl : null;

    return (
        <button
            type="button"
            onClick={() => {
                if (isAnyLoading) return;
                onSelect(item.link);
            }}
            className={cn(
                "ui-pressable group relative flex h-full min-h-[320px] cursor-pointer flex-col overflow-hidden rounded-[28px] border-4 border-[#d8d3cb] bg-white text-left transition-all duration-300",
                isAnyLoading && !isLoading && "opacity-75"
            )}
            style={getPressableStyle("#d8d3cb", 8)}
        >
            <div className="relative h-40 overflow-hidden border-b-4 border-[#ece7df]">
                <div className={cn("absolute inset-0", fallbackGradient)} />
                {resolvedImageUrl && (
                    <img
                        src={resolvedImageUrl}
                        alt={item.title}
                        className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                        onError={() => {
                            setFailedImageUrl(resolvedImageUrl);
                        }}
                    />
                )}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_38%)]" />
                <div className={cn(
                    "absolute left-3 top-3 rounded-full border-2 px-2.5 py-1 text-[10px] font-black tracking-wide",
                    statusMeta.className
                )}>
                    {statusMeta.label}
                </div>
                <div className="absolute right-3 top-3 rounded-full border-2 border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-black text-slate-700">
                    {sourceLabel}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.link);
                    }}
                    className="ui-pressable absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#fbcfe8] bg-white text-rose-500"
                    style={getPressableStyle("#fbcfe8", 4)}
                    title="Remove article"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#4338ca]">
                        {formatArticleDate(item)}
                    </span>
                    {typeof item.quizScorePercent === "number" ? (
                        <span className="rounded-full border-2 border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1 text-[10px] font-black text-[#1d4ed8]">
                            Score {item.quizScorePercent}%
                        </span>
                    ) : null}
                </div>

                <h4 className={cn(
                    "line-clamp-2 font-welcome-ui text-[1.05rem] font-black leading-[1.2] tracking-[-0.02em] transition-colors md:text-[1.14rem]",
                    isRead ? "text-slate-700" : "text-slate-900"
                )}>
                    {item.title}
                </h4>

                <p className="line-clamp-3 text-sm leading-6 text-slate-500">
                    {item.snippet || "打开文章继续训练你的阅读理解与词汇判断。"}
                </p>

                <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                    <div className="text-[11px] font-semibold text-slate-400">
                        {category === "cat_mode"
                            ? "Adaptive session"
                            : category === "ai_gen"
                                ? "Generated lesson"
                                : `${item.source} · 阅读`}
                    </div>
                    <span className={cn(
                        "inline-flex items-center gap-1 rounded-full border-2 px-3 py-1.5 text-xs font-black transition-all duration-300",
                        isLoading
                            ? "border-[#d8d3cb] bg-[#fffdf8] text-slate-700"
                            : isRead
                                ? "border-[#d8d3cb] bg-[#fffdf8] text-slate-600"
                                : "border-[#2563eb] bg-[#2563eb] text-white shadow-[0_4px_0_0_#1d4ed8]"
                    )}>
                        {isLoading ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                正在加载
                            </>
                        ) : (
                            <>
                                {isRead ? "继续阅读" : "进入文章"} <ExternalLink className="h-3 w-3" />
                            </>
                        )}
                    </span>
                </div>
            </div>
        </button>
    );
}
