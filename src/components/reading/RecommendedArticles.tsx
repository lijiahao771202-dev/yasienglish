"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, ExternalLink, Loader2, BookOpen, Cpu, Sparkles, Send, RefreshCw, Trash2, Check, Settings2, LayoutGrid, ChevronDown, Compass } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFeedStore } from "@/lib/feed-store";
import { useUserStore } from "@/lib/store";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getPressableStyle, getPressableTap } from "@/lib/pressable";
import { applyServerProfilePatchToLocal, deleteReadArticleSnapshot } from "@/lib/user-repository";
import { CAT_RANK_TIERS, getCatRankIconByTierId, getCatRankTier, getCatScoreToNextRank, getLegacyBandFromScore } from "@/lib/cat-score";
import { CatGrowthChart } from "@/components/reading/CatGrowthChart";
import { SpotlightTour, type TourStep } from "@/components/ui/SpotlightTour";

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
    catSelfAssessed?: boolean;
    catBand?: number;
    catScoreSnapshot?: number;
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
    catSelfAssessed?: boolean;
    catBand?: number;
    catScoreSnapshot?: number;
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
    onArticleDeleted?: (url: string) => void;
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

async function safeParseResponsePayload(response: Response) {
    const rawText = await response.text().catch(() => "");
    if (!rawText.trim()) {
        return null;
    }

    try {
        return JSON.parse(rawText) as Record<string, unknown>;
    } catch {
        return {
            error: rawText.trim(),
        };
    }
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

export function RecommendedArticles({ onSelect, onArticleLoaded, onListUpdate, onArticleDeleted }: RecommendedArticlesProps) {
    const prefersReducedMotion = useReducedMotion();
    const reducedMotion = Boolean(prefersReducedMotion);
    const silentImageHydrationRef = useRef<Record<string, boolean>>({});
    const [articles, setArticles] = useState<ArticleItem[]>([]);
    const searchParams = useSearchParams();

    const [category, setCategory] = useState<FeedCategory>(() => {
        const routeTask = searchParams?.get('smart_task');
        if (routeTask === 'reading_ai') return 'ai_gen';
        if (routeTask === 'cat') return 'cat_mode';
        return 'cat_mode';
    });
    const [activeView, setActiveView] = useState<ArticleView>('all');
    const [genTopic, setGenTopic] = useState("");
    const [genDifficulty, setGenDifficulty] = useState<'cet4' | 'cet6' | 'ielts'>(() => {
        const routeExam = searchParams?.get('exam_track');
        if (routeExam === 'cet4' || routeExam === 'cet6' || routeExam === 'ielts') return routeExam as 'cet4' | 'cet6' | 'ielts';
        return 'ielts';
    });
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
    const [showHubTour, setShowHubTour] = useState(false);

    useEffect(() => {
        if (category === "cat_mode") {
            const hasCompleted = localStorage.getItem("read-hub-v2-onboarded");
            if (!hasCompleted) {
                setIsCatRankOverviewOpen(true); // Open rank container for tour target
                const timer = setTimeout(() => setShowHubTour(true), 1500);
                return () => clearTimeout(timer);
            }
        }
    }, [category]);

    const handleHubTourComplete = () => {
        localStorage.setItem("read-hub-v2-onboarded", "true");
        setShowHubTour(false);
    };

    const hubTourSteps: TourStep[] = category === "ai_gen" ? [
        {
            targetId: "read-hub-tabs",
            title: "全能沙盒泛读区",
            content: "与严格定级的 CAT 模式不同，『AI 生成区』不设限制！您可以把它当做一个自由训练场，随心所欲定制定制题材与考纲难度。",
            placement: "bottom"
        },
        {
            targetId: "hub-ai-studio",
            title: "智能出卷台",
            content: "不管您是要考量词汇量的四六级，还是着重逻辑链的雅思，在这里点击切换，大模型会自动注入对应的出题标准与长难句式！",
            placement: "bottom"
        },
        {
            targetId: "hub-ai-topic",
            title: "突破界限的题材库",
            content: "觉得预设不够玩？直接输入您感兴趣的偏门词条，哪怕是“元宇宙修仙”，系统都能强行给您抽取出严肃的四六级雅思考试长文！这就是生成式AI的魅力所在！",
            placement: "top"
        }
    ] : [
        {
            targetId: "read-hub-tabs",
            title: "双引擎阅读架构",
            content: "阅读中心内嵌了两种运转逻辑截然不同的引擎。右侧的『AI 生成』是供您拓展舒适区、自配考纲的“泛读沙盒”；而您当前开启的『CAT 成长』，则是旨在刺探您真实词汇与逻辑上限的“智适应定级斗兽场”。",
            placement: "bottom"
        },
        {
            targetId: "hub-cat-console",
            title: "极简背后的黑盒模型",
            content: "这并非传统的做题机。在极简的工作面板下，运转着严格的 IRT（项目反应理论）算法引擎。在这里“难度选择”被直接接管；每当您点击开始，贝叶斯模型都会基于您当下的能力潜能 (Theta)，从海量语料核心里萃取出一篇命中要害、信息增益率最大的文章。一局一测，拒绝无效冗余。",
            placement: "bottom"
        },
        {
            targetId: "hub-cat-rank",
            title: "多维量化成长网络",
            content: "所有枯燥的能力参数都已被具象化为段位天梯。我们将底层的自适应算力评级，跨界融合了大家熟悉的青铜、钻石、星耀等游戏化机制，构建了一个让人上瘾的攀登体感。",
            placement: "top"
        },
        {
            targetId: "hub-cat-tier-a2",
            title: "奠基：初高阶基础带",
            content: "排位起步！A区序列涵盖了从零基础到高中毕业的词汇模型。您的每次正确反馈，都在自动为您修补这层脆弱的地基。",
            placement: "top"
        },
        {
            targetId: "hub-cat-tier-c1_minus",
            title: "突围：四六级双穿门槛",
            content: "当您冲杀至这片 B-C 组交界赛区（1600分左右），意味着您已彻底撕裂国内英语四六级的统考封锁线，正式具备实战长难句的解码算力！",
            placement: "bottom"
        },
        {
            targetId: "hub-cat-tier-c2",
            title: "深水区：雅思高阶考核",
            content: "这是极其艰险的 C2 编队区域（2400分）。在这里，系统将抛给您极高密度的学术语料，抽象逻辑链将开始全面压榨您的工作记忆区！",
            placement: "bottom"
        },
        {
            targetId: "hub-cat-tier-master",
            title: "终极毕业指标",
            content: "一路披荆斩棘，这就是我们最终为您锁定的目标：Master（8.0+ 满分段）。系统会持续用魔鬼强度的智适应难题为您护航，一旦您站上神坛，即可宣告光荣毕业！",
            placement: "top"
        },
        {
            targetId: "hub-cat-chart",
            title: "Theta 潜能动态巡航",
            content: "这不是死板的分数线，而是算法对您每一次战局的“心电图”捕获。在提交每一篇高强度的盲测自评后，数学模型将实时重构信心域，这条曲线会在动态纠偏中为您划出认知的攀升轨迹。现在，请开启您的第一场心智演练！",
            placement: "left"
        }
    ];

    const { setFeed, getFeed, loadFeedFromDB, deleteArticle } = useFeedStore();
    const { readArticleUrls } = useUserStore();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const catScore = typeof profile?.cat_score === "number" ? profile.cat_score : 1000;
    const catBand = typeof profile?.cat_current_band === "number"
        ? profile.cat_current_band
        : getLegacyBandFromScore(catScore);
    const catPendingDifficultySignal = typeof profile?.cat_pending_difficulty_signal === "number"
        ? profile.cat_pending_difficulty_signal
        : 0;
    const catRank = getCatRankTier(catScore);
    const catScoreToNextRank = getCatScoreToNextRank(catScore);
    const listContainerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.08,
                delayChildren: 0.05,
            },
        },
    };
    const listItemVariants = {
        hidden: { opacity: 0, scale: 0.98, y: 30 },
        show: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { type: "spring", stiffness: 220, damping: 24, mass: 1 },
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
                .filter((row) => (
                    Boolean((row as unknown as { isAIGenerated?: boolean }).isAIGenerated)
                    && !Boolean(row.isCatMode)
                    && !row.url.startsWith("cat://")
                ))
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
                catSelfAssessed: row.catSelfAssessed,
                catBand: row.catBand,
                catScoreSnapshot: row.catScoreSnapshot,
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
                catSelfAssessed: row.catSelfAssessed,
                catBand: row.catBand,
                catScoreSnapshot: row.catScoreSnapshot,
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
                    difficultySignalHint: catPendingDifficultySignal || undefined,
                }),
            });
            const payload = await safeParseResponsePayload(response);
            if (!response.ok) {
                const message = payload && typeof payload.error === "string"
                    ? payload.error
                    : `启动 CAT 训练失败（${response.status}）`;
                throw new Error(message);
            }
            if (!payload) {
                throw new Error("启动 CAT 训练失败：服务器返回了空响应。");
            }

            await applyServerProfilePatchToLocal({
                cat_score: (payload.catProfile as Record<string, unknown> | undefined)?.score,
                cat_level: (payload.catProfile as Record<string, unknown> | undefined)?.level,
                cat_theta: (payload.catProfile as Record<string, unknown> | undefined)?.theta,
                cat_se: (payload.catProfile as Record<string, unknown> | undefined)?.se,
                cat_points: (payload.catProfile as Record<string, unknown> | undefined)?.points,
                cat_current_band: (payload.catProfile as Record<string, unknown> | undefined)?.currentBand,
            });
            if (profile?.id !== undefined && catPendingDifficultySignal !== 0) {
                await db.user_profile.update(profile.id, {
                    cat_pending_difficulty_signal: 0,
                });
            }

            if (payload.article && onArticleLoaded) {
                onArticleLoaded(payload.article as GeneratedArticleData);
            }
            setNotification({
                message: `CAT 已启动 · ${((payload.catSession as Record<string, unknown> | undefined)?.rankBefore as string | undefined) ?? catRank.name}`,
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
                    if (onArticleDeleted) onArticleDeleted(link);
                    await deleteReadArticleSnapshot(link);
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
            if (onArticleDeleted) onArticleDeleted(link);
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

    const shellCardClass = "rounded-[30px] border-4 border-theme-border bg-theme-base-bg shadow-[0_12px_0_0_var(--theme-shadow)]";
    const insetCardClass = "rounded-[24px] border-4 border-theme-border bg-theme-card-bg";
    const utilityButtonClass = "ui-pressable inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-theme-border bg-theme-base-bg px-4 text-sm font-black text-theme-text disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
    const tabItems: Array<{ id: FeedCategory; label: string }> = [
        { id: "cat_mode", label: "CAT 成长" },
        { id: "ai_gen", label: "AI 生成" },
        { id: "psychology", label: "心理学" },
        { id: "ai_news", label: "AI 资讯" },
    ];
    const panelTransition = {
        duration: prefersReducedMotion ? 0.16 : 0.6,
        ease: [0.22, 1, 0.36, 1] as const,
    };
    const panelEnter = prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: 25, scale: 0.98 };
    const panelExit = prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: -15, scale: 0.98 };

    const blockEntryVariants = {
        hidden: { opacity: 0, y: 25, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 220, damping: 24, mass: 1 } },
        exit: { opacity: 0, y: -15, scale: 0.98, transition: { duration: 0.2 } }
    };

    return (
        <motion.div
            className="mx-auto w-full max-w-[1180px]"
            initial={prefersReducedMotion ? false : "hidden"}
            animate="show"
            variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.02 } }
            }}
        >
            <motion.div
                layout
                variants={prefersReducedMotion ? undefined : blockEntryVariants}
                transition={{ layout: panelTransition, duration: panelTransition.duration, ease: panelTransition.ease }}
                className="relative mb-6 overflow-hidden rounded-[34px] border-4 border-[color:var(--mist-read-bd)] bg-[color:var(--mist-read-bg)] px-5 py-5 shadow-[0_12px_0_0_var(--mist-read-sd)] md:px-6 md:py-6"
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
                            <p className="inline-flex items-center gap-2 rounded-full border-[3px] border-theme-border bg-theme-primary-bg px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-theme-primary-text shadow-[0_3px_0_var(--theme-shadow)]">
                                <Sparkles className="h-3.5 w-3.5" />
                                Reading Flow
                            </p>
                            <h3 className="mt-4 font-welcome-display text-[2.3rem] font-black leading-[0.92] tracking-[-0.05em] text-theme-text md:text-[3rem]">
                                阅读流
                            </h3>
                            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-theme-text-muted">
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
                                        className={cn(utilityButtonClass, "border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_4px_0_0_var(--theme-shadow)]")}
                                        style={getPressableStyle("var(--theme-shadow)", 4)}
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
                                                className="absolute right-0 top-full z-50 mt-3 rounded-[22px] border-4 border-theme-border bg-theme-card-bg p-3 shadow-[0_10px_0_0_var(--theme-shadow)]"
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

                    <div className="flex flex-col md:flex-row gap-3 rounded-[28px] border-4 border-theme-border bg-theme-card-bg p-2 shadow-[0_3px_0_var(--theme-shadow)]">
                        {[
                            { tourId: "read-hub-tabs", items: tabItems.slice(0, 2) },
                            { tourId: undefined, items: tabItems.slice(2, 4) }
                        ].map((group, groupIdx) => (
                            <div key={groupIdx} data-tour-target={group.tourId} className="grid flex-1 gap-3 md:grid-cols-2">
                                {group.items.map((tab) => (
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
                                                ? "text-theme-active-text"
                                                : "bg-theme-base-bg text-theme-text-muted hover:text-theme-text"
                                        )}
                                        style={getPressableStyle(category === tab.id ? "var(--theme-shadow)" : "rgba(0,0,0,0.1)", 4)}
                                    >
                                        {category === tab.id ? (
                                            <motion.span
                                                layoutId="read-category-pill"
                                                className="absolute inset-0 rounded-full bg-theme-active-bg shadow-[0_6px_0_0_var(--theme-shadow)] border-[3px] border-theme-border"
                                                transition={panelTransition}
                                            />
                                        ) : null}
                                        <span className="relative z-10">{tab.label}</span>
                                    </button>
                                ))}
                            </div>
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
                                <div className="grid gap-3 rounded-[28px] border-4 border-theme-border bg-theme-card-bg p-2 shadow-[0_3px_0_var(--theme-shadow)] md:grid-cols-4">
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
                                                        ? "text-theme-primary-text"
                                                        : "bg-theme-base-bg text-theme-text-muted hover:text-theme-text"
                                                )}
                                                style={getPressableStyle(isActive ? "var(--theme-shadow)" : "rgba(0,0,0,0.1)", 4)}
                                            >
                                                {isActive ? (
                                                    <motion.span
                                                        layoutId="read-view-pill"
                                                        className="absolute inset-0 rounded-full bg-theme-primary-bg shadow-[0_6px_0_0_var(--theme-shadow)] border-[3px] border-theme-border"
                                                        transition={panelTransition}
                                                    />
                                                ) : null}
                                                <span className="relative z-10 flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    <span>{filterItem.label}</span>
                                                    <span className={cn(
                                                        "rounded-full px-2 py-0.5 text-[10px] font-black border-2",
                                                        isActive ? "bg-theme-card-bg text-theme-primary-text border-theme-border" : "bg-theme-card-bg border-theme-border text-theme-text font-bold"
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
                <div className="mb-5 rounded-[24px] border-4 border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-rose-700 shadow-[0_8px_0_0_rgba(254,202,202,1)]">
                    {catStartError}
                </div>
            ) : null}

            <AnimatePresence mode="wait">
                {category === 'ai_gen' ? (
                <motion.div
                    key="board-ai-gen"
                    className="space-y-6"
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    variants={{
                        hidden: panelEnter,
                        show: { opacity: 1, y: 0, scale: 1, transition: { staggerChildren: 0.08, ...panelTransition } },
                        exit: panelExit
                    }}
                >
                    <motion.section data-tour-target="hub-ai-studio" variants={prefersReducedMotion ? undefined : blockEntryVariants} className={cn(shellCardClass, "p-5 md:p-6")}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">AI Studio</p>
                                <h4 className="mt-2 font-welcome-display text-[2rem] font-black leading-[0.95] tracking-[-0.04em] text-theme-text">
                                    智能写作台
                                </h4>
                                <p className="mt-2 text-sm font-medium text-theme-text-muted">把难度、主题和生成合并为一个连续工作流。</p>
                            </div>
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)]">
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
                                            whileTap={getPressableTap(reducedMotion, 6, 0.985)}
                                            style={getPressableStyle("var(--theme-shadow)", 6)}
                                            className={cn(
                                                "ui-pressable group relative overflow-hidden rounded-[24px] border-4 p-4 text-left transition-all duration-350",
                                                isActive
                                                    ? cn(diff.activeClass, "border-theme-border")
                                                    : "border-theme-border bg-theme-card-bg text-theme-text"
                                            )}
                                        >
                                            <div className="relative">
                                                <div className={cn(
                                                    "mb-3 inline-flex rounded-[18px] border-2 border-theme-border p-2.5 transition-transform duration-300 group-hover:scale-105",
                                                    isActive ? diff.iconClass : "bg-theme-base-bg text-theme-text-muted"
                                                )}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <p className="text-base font-bold leading-tight text-theme-text">{diff.label}</p>
                                                <p className="mt-1 text-xs font-medium text-theme-text-muted">{diff.desc}</p>
                                                <p className="mt-0.5 text-[11px] text-theme-text-muted opacity-80">{diff.detail}</p>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                        </div>

                        <div data-tour-target="hub-ai-topic" className={cn(insetCardClass, "mt-5 p-4 md:p-5")}>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <h5 className="text-sm font-black text-theme-text">主题选择</h5>
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
                                            whileTap={getPressableTap(reducedMotion, 4, 0.98)}
                                            style={getPressableStyle(genTopic === topic ? "#374151" : "#d8d3cb", 4)}
                                            className={cn(
                                                "ui-pressable rounded-full border-2 px-3.5 py-1.5 text-xs font-black transition-all duration-250",
                                                genTopic === topic
                                                    ? "border-theme-border bg-theme-primary-bg text-theme-primary-text"
                                                    : "border-theme-border bg-theme-card-bg text-theme-text-muted hover:text-theme-text"
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
                                        className="w-full rounded-full border-4 border-theme-border bg-theme-base-bg px-5 py-3 text-sm font-medium text-theme-text transition-all placeholder:text-theme-text-muted/60 focus:border-theme-border focus:ring-4 focus:ring-theme-primary-bg focus:outline-none"
                                    />
                                    <motion.button
                                        type="button"
                                        onClick={handleGenerate}
                                        disabled={isGenerating}
                                        whileHover={isGenerating ? undefined : { y: -1, scale: 1.01 }}
                                        whileTap={isGenerating ? undefined : getPressableTap(reducedMotion, 6, 0.985)}
                                        style={getPressableStyle(isGenerating ? "rgba(0,0,0,0.1)" : "var(--theme-shadow)", 6)}
                                        className={cn(
                                            "ui-pressable group relative overflow-hidden rounded-full px-5 py-3 text-sm font-black transition-all duration-300 disabled:shadow-none",
                                            isGenerating
                                                ? "cursor-not-allowed border-4 border-theme-border bg-theme-card-bg text-theme-text-muted"
                                                : "border-4 border-theme-border bg-theme-active-bg text-theme-active-text"
                                        )}
                                    >
                                        <span className="relative flex items-center gap-2">
                                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                            {isGenerating ? "正在生成..." : "生成文章"}
                                        </span>
                                    </motion.button>
                                </div>
                            </div>
                    </motion.section>

                    <motion.div variants={prefersReducedMotion ? undefined : blockEntryVariants} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-sm font-black text-theme-text">历史文章</h4>
                            <span className="text-xs text-theme-text-muted">{articles.length} 篇</span>
                        </div>

                        {articles.length === 0 ? (
                            <div className={cn(shellCardClass, "p-8 text-center text-sm text-theme-text-muted")}>
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
                    </motion.div>
                </motion.div>
            ) : category === "cat_mode" ? (
                <motion.div
                    key="board-cat-mode"
                    className="space-y-6"
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    variants={{
                        hidden: panelEnter,
                        show: { opacity: 1, y: 0, scale: 1, transition: { staggerChildren: 0.08, ...panelTransition } },
                        exit: panelExit
                    }}
                >
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
                        <motion.section data-tour-target="hub-cat-console" variants={prefersReducedMotion ? undefined : blockEntryVariants} className={cn(shellCardClass, "p-5 md:p-6")}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">Training Console</p>
                                    <h4 className="mt-2 font-welcome-display text-[2rem] font-black tracking-[-0.04em] text-theme-text md:text-[2.2rem]">
                                        CAT 自适应训练
                                    </h4>
                                    <p className="mt-2 text-sm font-medium text-slate-600">一局一篇，按表现自动调节难度，把入口做成更像首页的可爱训练工作台。</p>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border-2 border-theme-border bg-theme-active-bg px-4 py-2 text-sm font-black text-theme-active-text shadow-[0_4px_0_0_var(--theme-shadow)]">
                                    <span className="text-base leading-none">{getCatRankIconByTierId(catRank.id)}</span>
                                    <span>{catRank.name}</span>
                                    <span className="rounded-full bg-theme-card-bg px-2 py-0.5 text-xs font-black text-theme-text border-2 border-theme-border">{catScore}</span>
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1fr]">
                                <button
                                    data-tour-target="hub-cat-rank"
                                    type="button"
                                    onClick={() => setIsCatRankOverviewOpen((prev) => !prev)}
                                    className={cn("ui-pressable w-full px-4 py-4 text-left", insetCardClass)}
                                    style={getPressableStyle("var(--theme-shadow)", 6)}
                                >
                                    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
                                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border-[3px] border-theme-border bg-theme-card-bg text-xl shadow-[0_4px_0_0_var(--theme-shadow)]">
                                            {getCatRankIconByTierId(catRank.id)}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-theme-text">{catRank.primaryLabel}</p>
                                            <p className="truncate text-xs font-medium text-theme-text-muted">{catRank.secondaryLabel}</p>
                                        </div>
                                        <div className="rounded-[18px] border-[3px] border-theme-border bg-theme-card-bg px-3 py-2 text-right shadow-[0_3px_0_0_var(--theme-shadow)]">
                                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-theme-text-muted mt-0.5">下一段</p>
                                            <p className="text-sm font-black text-theme-text">
                                                {catScoreToNextRank > 0 ? `还差 ${catScoreToNextRank} 分` : "已到顶段"}
                                            </p>
                                        </div>
                                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-card-bg text-theme-text-muted">
                                            <ChevronDown
                                                className={cn(
                                                    "h-4 w-4 transition-transform duration-300",
                                                    isCatRankOverviewOpen && "rotate-180",
                                                )}
                                            />
                                        </span>
                                    </div>
                                </button>

                                <div className={cn(insetCardClass, "p-4 border-theme-border bg-theme-card-bg")}>
                                    <p className="px-1 text-xs font-black uppercase tracking-[0.12em] text-theme-text-muted">训练主题（可选）</p>
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                                        <input
                                            type="text"
                                            value={catTopic}
                                            onChange={(event) => setCatTopic(event.target.value)}
                                            onKeyDown={(event) => event.key === "Enter" && handleStartCatSession()}
                                            placeholder="例如：睡眠与记忆、AI 与教育"
                                            className="w-full rounded-full border-[3px] border-theme-border bg-theme-base-bg px-4 py-3 text-sm text-theme-text transition-all placeholder:text-theme-text-muted/60 focus:border-theme-border focus:ring-4 focus:ring-theme-primary-bg focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleStartCatSession}
                                            disabled={isStartingCat}
                                            className="ui-pressable inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-theme-border bg-theme-active-bg px-5 py-3 text-sm font-black text-theme-active-text disabled:opacity-50 disabled:shadow-none"
                                            style={getPressableStyle("var(--theme-shadow)", 6)}
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
                                        <div data-tour-target="hub-cat-tiers" className={cn(insetCardClass, "mt-4 p-3")}>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {CAT_RANK_TIERS.map((tier) => {
                                                    const isActive = tier.id === catRank.id;
                                                    return (
                                                        <div
                                                            key={tier.id}
                                                            data-tour-target={`hub-cat-tier-${tier.id}`}
                                                            className={cn(
                                                                "rounded-[18px] border-[3px] px-3 py-2.5 transition-all",
                                                                isActive
                                                                    ? "border-theme-border bg-theme-active-bg shadow-[0_4px_0_0_var(--theme-shadow)]"
                                                                    : "border-theme-border/50 bg-theme-base-bg",
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base leading-none">{getCatRankIconByTierId(tier.id)}</span>
                                                                <span className="text-xs font-black text-theme-text">{tier.name}</span>
                                                            </div>
                                                            <p className="mt-1 text-[10px] text-theme-text-muted">
                                                                {tier.maxScore === null ? `${tier.minScore}+` : `${tier.minScore}-${tier.maxScore}`}
                                                            </p>
                                                            <p className="mt-1 text-[11px] font-black text-theme-text">{tier.primaryLabel}</p>
                                                            <p className="text-[11px] text-theme-text-muted">{tier.secondaryLabel}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.section>

                        <motion.div data-tour-target="hub-cat-chart" className="self-start" variants={prefersReducedMotion ? undefined : blockEntryVariants}>
                            <CatGrowthChart currentScore={catScore} />
                        </motion.div>
                    </div>

                    <motion.div variants={prefersReducedMotion ? undefined : blockEntryVariants} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-sm font-black text-theme-text">训练历史</h4>
                            <span className="text-xs text-theme-text-muted">{articles.length} 篇</span>
                        </div>

                        {articles.length === 0 ? (
                            <div className={cn(shellCardClass, "p-8 text-center text-sm text-theme-text-muted")}>
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
                    </motion.div>
                </motion.div>
            ) : (
                <motion.div
                    key={`board-feed-${category}`}
                    className="space-y-8"
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    variants={{
                        hidden: panelEnter,
                        show: { opacity: 1, y: 0, scale: 1, transition: { staggerChildren: 0.08, ...panelTransition } },
                        exit: panelExit
                    }}
                >
                    {articles.length === 0 && (
                        <div className={cn(shellCardClass, "py-16 text-center text-sm italic text-theme-text-muted")}>
                            点击刷新按钮抓取文章 / Click refresh to fetch articles
                        </div>
                    )}

                    {articles.length > 0 && (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`feed-view-${category}-${activeView}-${feedViewModel.filteredArticles.length === 0 ? "empty" : "filled"}`}
                                className="space-y-6"
                                variants={prefersReducedMotion ? undefined : blockEntryVariants}
                            >
                                {feedViewModel.filteredArticles.length === 0 ? (
                                    <div className={cn(shellCardClass, "p-10 text-center text-sm text-theme-text-muted")}>
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

            <SpotlightTour 
                isOpen={showHubTour} 
                onClose={handleHubTourComplete} 
                onComplete={handleHubTourComplete}
                steps={hubTourSteps} 
            />

            <motion.button
                initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 1, type: "spring", stiffness: 300, damping: 20 }}
                whileHover={{ scale: 1.1, rotate: 15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                    if (category === "ai_gen") {
                        setTimeout(() => setShowHubTour(true), 150);
                    } else {
                        setCategory("cat_mode");
                        setIsCatRankOverviewOpen(true);
                        setTimeout(() => setShowHubTour(true), 300);
                    }
                }}
                className="fixed bottom-6 right-6 z-[2800] flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_6px_0_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_2px_0_0_var(--theme-shadow)]"
                title="开启阅读入口指南"
            >
                <Compass className="h-6 w-6 stroke-[2.5]" />
            </motion.button>
        </motion.div>
    );
}

function ArticleCard({ item, status, category, onSelect, onDelete, isLoading = false, isAnyLoading = false }: {
    item: ArticleItem,
    status: ArticleStatus,
    category: FeedCategory,
    onSelect: (url: string) => void,
    onDelete: (url: string) => void,
    isLoading?: boolean,
    isAnyLoading?: boolean,
}) {
    const isCatMode = category === "cat_mode";
    const isCatFullyCompleted = isCatMode ? Boolean(item.quizCompleted && item.catSelfAssessed) : false;
    const isPendingAssessment = isCatMode && item.quizCompleted && !item.catSelfAssessed;
    
    const isRead = isCatMode ? isCatFullyCompleted : status === 'read';
    let difficultyMeta = getDifficultyBadgeMeta(item.difficulty);
    
    if (typeof item.catScoreSnapshot === "number") {
        const tier = getCatRankTier(item.catScoreSnapshot);
        difficultyMeta = {
            label: tier.name,
            className: "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_3px_0_0_var(--theme-shadow)]",
        };
    } else if (item.catBand !== undefined) {
        const legacyApproxScore = (item.catBand - 1) * 400;
        const tier = getCatRankTier(legacyApproxScore);
        difficultyMeta = {
            label: tier.name,
            className: "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_3px_0_0_var(--theme-shadow)]",
        };
    }
    
    let statusMeta;
    if (isCatMode) {
        if (isCatFullyCompleted) {
            statusMeta = { label: '已完成', className: 'border-theme-border bg-theme-active-bg text-theme-active-text' };
        } else if (isPendingAssessment) {
            statusMeta = { label: '待自评', className: 'border-theme-border bg-amber-200 text-amber-800 shadow-[0_4px_0_0_rgba(251,191,36,0.3)]' };
        } else {
            statusMeta = { label: '待完成', className: 'border-theme-border bg-theme-primary-bg text-theme-primary-text animate-[bounce_2s_infinite] shadow-[0_4px_0_0_var(--theme-shadow)]' };
        }
    } else {
        statusMeta = status === 'new'
            ? { label: '新到达', className: 'border-theme-border bg-theme-primary-bg text-theme-primary-text' }
            : status === 'read'
                ? { label: '已读', className: 'border-theme-border bg-theme-active-bg text-theme-active-text' }
                : { label: '未读', className: 'border-theme-border bg-theme-base-bg text-theme-text-muted' };
    }

    const sourceLabel = category === "ai_gen" ? "AI Studio" : (item.source || "Feed");
    const primaryImageUrl = typeof item.image === "string" && item.image.trim().length > 0 ? item.image.trim() : null;
    const backupImageUrl = `https://picsum.photos/seed/${encodeURIComponent((item.title || item.link).slice(0, 64))}/960/540`;
    const imageCandidates = Array.from(
        new Set([primaryImageUrl, backupImageUrl].filter((candidate): candidate is string => Boolean(candidate)))
    );
    const [failedImageUrlsByLink, setFailedImageUrlsByLink] = useState<Record<string, string[]>>({});

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
    const failedImageUrls = failedImageUrlsByLink[item.link] ?? [];
    const resolvedImageUrl = imageCandidates.find((candidate) => !failedImageUrls.includes(candidate)) ?? null;
    const handleOpenArticle = () => {
        if (isAnyLoading) return;
        onSelect(item.link);
    };

    return (
        <div
            role="button"
            tabIndex={isAnyLoading ? -1 : 0}
            onClick={handleOpenArticle}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                handleOpenArticle();
            }}
            className={cn(
                "ui-pressable group relative flex h-full min-h-[320px] cursor-pointer flex-col overflow-hidden rounded-[28px] border-4 border-theme-border bg-theme-card-bg text-left transition-all duration-300",
                isAnyLoading && !isLoading && "opacity-75"
            )}
            style={getPressableStyle("var(--theme-shadow)", 8)}
        >
            <div className="relative h-40 overflow-hidden border-b-4 border-theme-border">
                <div className={cn("absolute inset-0 z-0", fallbackGradient)} />
                {resolvedImageUrl && (
                    <img
                        src={resolvedImageUrl}
                        alt={item.title}
                        className="absolute inset-0 z-10 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                        onError={() => {
                            setFailedImageUrlsByLink((previous) => {
                                const current = previous[item.link] ?? [];
                                if (current.includes(resolvedImageUrl)) return previous;
                                return {
                                    ...previous,
                                    [item.link]: [...current, resolvedImageUrl],
                                };
                            });
                        }}
                    />
                )}
                <div className="absolute inset-0 z-20 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_38%)]" />
                <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
                    <div className={cn(
                        "rounded-full border-2 px-2.5 py-1 text-[10px] font-black tracking-wide",
                        statusMeta.className
                    )}>
                        {statusMeta.label}
                    </div>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete(item.link);
                        }}
                        className="ui-pressable opacity-0 group-hover:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded-full border-2 border-theme-border bg-theme-card-bg text-rose-500"
                        style={getPressableStyle("var(--theme-shadow)", 3)}
                        title="删除文章"
                        aria-label="删除文章"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
                    {difficultyMeta ? (
                        <div className={cn(
                            "rounded-full border-2 px-2.5 py-1 text-[10px] font-black tracking-wide",
                            difficultyMeta.className
                        )}>
                            {difficultyMeta.label}
                        </div>
                    ) : null}
                    <div className="rounded-full border-2 border-theme-border bg-theme-card-bg px-2.5 py-1 text-[10px] font-black text-theme-text-muted">
                        {sourceLabel}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-theme-base-bg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-theme-text-muted border-2 border-theme-border">
                        {formatArticleDate(item)}
                    </span>
                    {typeof item.quizScorePercent === "number" ? (
                        <span className="rounded-full border-2 border-theme-border bg-theme-active-bg px-2.5 py-1 text-[10px] font-black text-theme-active-text">
                            Score {item.quizScorePercent}%
                        </span>
                    ) : null}
                </div>

                <h4 className={cn(
                    "line-clamp-2 font-welcome-ui text-[1.05rem] font-black leading-[1.2] tracking-[-0.02em] transition-colors md:text-[1.14rem]",
                    isRead ? "text-theme-text-muted" : "text-theme-text"
                )}>
                    {item.title}
                </h4>

                <p className="line-clamp-3 text-sm leading-6 text-theme-text-muted opacity-90">
                    {item.snippet || "打开文章继续训练你的阅读理解与词汇判断。"}
                </p>

                <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                    <div className="text-[11px] font-semibold text-theme-text-muted">
                        {category === "cat_mode"
                            ? "Adaptive session"
                            : category === "ai_gen"
                                ? "Generated lesson"
                                : `${item.source} · 阅读`}
                    </div>
                    <span className={cn(
                        "inline-flex items-center gap-1 rounded-full border-[3px] px-3 py-1.5 text-xs font-black transition-all duration-300",
                        isLoading
                            ? "border-theme-border bg-theme-base-bg text-theme-text-muted"
                            : isRead
                                ? "border-theme-border bg-theme-base-bg text-theme-text-muted"
                                : "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_4px_0_0_var(--theme-shadow)]"
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
        </div>
    );
}
