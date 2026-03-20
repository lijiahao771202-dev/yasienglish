"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArticleDisplay } from "@/components/reading/ArticleDisplay";
import { AudioPlayer } from "@/components/shadowing/AudioPlayer";
import { WritingEditor } from "@/components/writing/WritingEditor";
import { RecommendedArticles } from "@/components/reading/RecommendedArticles";
import { ReadingQuizPanel, QuizQuestion } from "@/components/reading/ReadingQuizPanel";
import { PenTool, ArrowLeft, House, Palette, Edit3, Flashlight, Eye, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { useUserStore } from "@/lib/store";
import { resolveDailyArticleCandidate } from "@/lib/dailyArticle";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";

interface ArticleData {
    title: string;
    content: string;
    byline?: string;
    textContent?: string;
    blocks?: ArticleBlock[];
    url?: string; // Track current URL for sidebar highlighting
    siteName?: string; // For TED video sync
    videoUrl?: string; // TED video URL
    image?: string | null;
    difficulty?: 'cet4' | 'cet6' | 'ielts';
    isAIGenerated?: boolean;
    quizCompleted?: boolean;
    quizCorrect?: number;
    quizTotal?: number;
    quizScorePercent?: number;
}

interface ArticleBlock {
    type: 'paragraph' | 'header' | 'list' | 'image' | 'blockquote';
    id?: string;
    content?: string;
    tag?: string;
    items?: string[];
    src?: string;
    alt?: string;
    startTime?: number;
    endTime?: number;
}

interface QuizLocateRequest {
    requestId: number;
    questionNumber: number;
    paragraphNumber: number;
    evidence?: string;
}

import { ReadingSettingsProvider, useReadingSettings, READING_THEMES } from "@/contexts/ReadingSettingsContext";
import { AppearanceMenu } from "@/components/reading/AppearanceMenu";

function ReadingPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionUser = useAuthSessionUser();
    const [isLoading, setIsLoading] = useState(false);
    const [article, setArticle] = useState<ArticleData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWritingMode, setIsWritingMode] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isQuizMode, setIsQuizMode] = useState(false);
    const [routeExitTarget, setRouteExitTarget] = useState<"home" | "battle" | null>(null);
    const [articleTransitionMode, setArticleTransitionMode] = useState<"toArticle" | "toPicker">("toArticle");
    const [quizLocateRequest, setQuizLocateRequest] = useState<QuizLocateRequest | null>(null);
    const [quizCache, setQuizCache] = useState<Record<string, QuizQuestion[]>>({});
    const [quizCacheHydrated, setQuizCacheHydrated] = useState<Record<string, boolean>>({});
    const [, forceBackgroundRefresh] = useState(0);
    const { loadUserData, markArticleAsRead } = useUserStore();

    // Context Settings
    const { theme, fontClass, isFocusMode, toggleFocusMode, isBionicMode, toggleBionicMode } = useReadingSettings();
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
    const [isDockVisible, setIsDockVisible] = useState(true);
    const [isDockHovered, setIsDockHovered] = useState(false);
    const dockHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

    // Scroll Progress
    const [scrollProgress, setScrollProgress] = useState(0);
    const routeFrom = searchParams.get("from");
    const hasRouteEntry = routeFrom === "battle" || routeFrom === "home";
    const backgroundTheme = getSavedBackgroundTheme(sessionUser?.id);
    const backgroundSpec = getBackgroundThemeSpec(backgroundTheme);
    const pageIntroEase = [0.22, 1, 0.36, 1] as const;
    const navEntryInitial = hasRouteEntry
        ? { opacity: 0, y: 16, scale: 0.992, filter: "blur(8px)" }
        : { opacity: 0, y: 10 };
    const contentEntryInitial = hasRouteEntry
        ? { opacity: 0, y: 20, scale: 0.994, filter: "blur(10px)" }
        : { opacity: 0, y: 12 };
    const softReveal = {
        initial: { opacity: 0, y: 4, scale: 0.998 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -5, scale: 0.998 },
    };

    const clearDockHideTimer = useCallback(() => {
        if (dockHideTimerRef.current) {
            window.clearTimeout(dockHideTimerRef.current);
            dockHideTimerRef.current = null;
        }
    }, []);

    const scheduleDockHide = useCallback((delay = 1100) => {
        clearDockHideTimer();
        dockHideTimerRef.current = window.setTimeout(() => {
            setIsDockVisible(false);
        }, delay);
    }, [clearDockHideTimer]);

    const handleRouteExit = (target: "home" | "battle") => {
        if (routeExitTarget) return;
        setRouteExitTarget(target);
        window.setTimeout(() => {
            if (target === "home") {
                router.push("/?from=read");
                return;
            }
            router.push("/battle?from=read");
        }, 560);
    };

    useEffect(() => {
        const onBackgroundChange = (event: Event) => {
            const detail = (event as CustomEvent<{ themeId?: string }>).detail;
            if (typeof detail?.themeId === "string") {
                forceBackgroundRefresh((value) => value + 1);
                return;
            }
            forceBackgroundRefresh((value) => value + 1);
        };
        window.addEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
        return () => window.removeEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
    }, [sessionUser?.id]);

    useEffect(() => {
        const handleScroll = () => {
            const totalScroll = document.documentElement.scrollTop;
            const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scroll = `${totalScroll / windowHeight}`;
            setScrollProgress(Number(scroll));
        }
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!article) {
            clearDockHideTimer();
            setIsDockVisible(true);
            return;
        }

        setIsDockVisible(true);
        if (!isDockHovered) {
            scheduleDockHide(1300);
        }

        return () => {
            clearDockHideTimer();
        };
    }, [article, clearDockHideTimer, isDockHovered, scheduleDockHide]);

    useEffect(() => {
        if (!article) return;

        const handleMouseMove = (event: MouseEvent) => {
            if (event.clientY <= 92) {
                if (!isDockVisible) {
                    setIsDockVisible(true);
                }
                if (!isDockHovered) {
                    scheduleDockHide(1000);
                }
            }
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [article, isDockHovered, isDockVisible, scheduleDockHide]);

    // Load user data (history, vocab, read status) from DB on mount
    useEffect(() => {
        loadUserData();

        const checkDailyArticle = async () => {
            const { db } = await import("@/lib/db");
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const lastFetchDate = localStorage.getItem('last_daily_fetch_date');

            // Warm the local cache without hijacking the picker UI.
            if (lastFetchDate !== today) {
                try {
                    // Fetch feed list
                    const feedRes = await axios.get('/api/feed?category=psychology');
                    if (feedRes.data && feedRes.data.length > 0) {
                        const resolved = await resolveDailyArticleCandidate({
                            items: feedRes.data,
                            getExistingArticle: async (candidateUrl) => {
                                return db.articles.get({ url: candidateUrl });
                            },
                            parseArticle: async (candidateUrl) => {
                                const parseRes = await axios.post("/api/parse", { url: candidateUrl });
                                return parseRes.data;
                            },
                            onParseFailure: () => undefined,
                        });

                        if (resolved && resolved.source === "parsed") {
                            const articleData = { ...resolved.articleData, url: resolved.url };
                            await db.articles.put({
                                url: resolved.url,
                                title: articleData.title,
                                content: articleData.content,
                                textContent: articleData.textContent,
                                byline: articleData.byline,
                                siteName: articleData.siteName,
                                blocks: articleData.blocks,
                                image: articleData.image,
                                timestamp: Date.now()
                            });
                        }
                    }
                    localStorage.setItem('last_daily_fetch_date', today);
                } catch {
                    // Background warming should fail silently and keep the picker usable.
                }
            }
        };

        checkDailyArticle();
    }, [loadUserData]);

    const canShowQuizPanel = Boolean(isQuizMode && article?.isAIGenerated && article?.difficulty);
    const quizCacheKey = article ? `${article.url || article.title}::${article.difficulty || "unknown"}` : "";
    const quizDbKey = quizCacheKey ? `reading-quiz::${quizCacheKey}` : "";
    const parseParagraphNumber = (value: string): number | null => {
        const matched = value.match(/\d+/);
        if (!matched) return null;
        const num = Number(matched[0]);
        return Number.isFinite(num) && num > 0 ? num : null;
    };

    useEffect(() => {
        if (isQuizMode && (!article?.isAIGenerated || !article?.difficulty)) {
            setIsQuizMode(false);
        }
    }, [isQuizMode, article?.isAIGenerated, article?.difficulty]);

    useEffect(() => {
        if (!quizDbKey || quizCacheHydrated[quizDbKey]) return;
        let cancelled = false;

        const hydrateQuizCache = async () => {
            try {
                const { db } = await import("@/lib/db");
                const cached = await db.ai_cache.where("[key+type]").equals([quizDbKey, "quiz"]).first();
                const cachedQuestions = cached?.data?.questions;
                if (!cancelled && Array.isArray(cachedQuestions) && cachedQuestions.length > 0) {
                    setQuizCache((prev) => ({ ...prev, [quizCacheKey]: cachedQuestions as QuizQuestion[] }));
                }
            } catch (error) {
                console.error("Failed to hydrate quiz cache:", error);
            } finally {
                if (!cancelled) {
                    setQuizCacheHydrated((prev) => ({ ...prev, [quizDbKey]: true }));
                }
            }
        };

        hydrateQuizCache();
        return () => {
            cancelled = true;
        };
    }, [quizDbKey, quizCacheKey, quizCacheHydrated]);

    const handleUrlSubmit = async (url: string) => {
        setArticleTransitionMode("toArticle");
        setIsLoading(true);
        setError(null);
        try {
            // Check cache first
            const { db } = await import("@/lib/db");
            const cached = await db.articles.get({ url });

            if (cached) {
                setArticle({
                    title: cached.title,
                    content: cached.content,
                    textContent: cached.textContent,
                    byline: cached.byline,
                    siteName: cached.siteName,
                    blocks: cached.blocks,
                    url: cached.url,
                    difficulty: cached.difficulty,
                    isAIGenerated: cached.isAIGenerated,
                    quizCompleted: cached.quizCompleted,
                    quizCorrect: cached.quizCorrect,
                    quizTotal: cached.quizTotal,
                    quizScorePercent: cached.quizScorePercent,
                });

                // Update timestamp
                db.articles.update([cached.url, cached.title, cached.timestamp], { timestamp: Date.now() });
                markArticleAsRead(cached.url);
                setIsLoading(false);
                return;
            }

            const response = await axios.post("/api/parse", { url });
            const finalUrl = response.data.url || url;

            const articleData = { ...response.data, url: finalUrl };
            setArticle(articleData);
            markArticleAsRead(finalUrl);

            // Cache it
            await db.articles.put({
                url: finalUrl,
                title: articleData.title,
                content: articleData.content,
                textContent: articleData.textContent,
                byline: articleData.byline,
                siteName: articleData.siteName,
                blocks: articleData.blocks,
                timestamp: Date.now()
            });

        } catch (err) {
            console.error(err);
            setError("Failed to load article. Please check the URL and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main
            className={cn(
            "relative min-h-screen overflow-x-clip p-6 text-stone-800 transition-all duration-500 ease-in-out md:p-12",
            article ? READING_THEMES.find(t => t.id === theme)?.class : undefined,
            fontClass // Apply Font Global
        )}
        >
            <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.baseLayer}`} />
            <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.glassLayer}`} />
            <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.glowLayer}`} />
            <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[34%] ${backgroundSpec.bottomLayer}`} />
            <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.vignetteLayer}`} />

            <div className="relative z-10">
            <AnimatePresence>
                {routeExitTarget && (
                    <motion.div
                        className="pointer-events-none fixed inset-0 z-[80]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={`absolute inset-0 backdrop-blur-[8px] ${backgroundSpec.transitionFilm}`}
                            initial={{ scale: 1.08, filter: "blur(22px)" }}
                            animate={{ scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.76, ease: [0.18, 1, 0.3, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Navigation Dock */}
            <motion.nav
                className={cn(
                    "fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500",
                    article && !isDockVisible && "pointer-events-none"
                )}
                style={{ transformOrigin: "50% 0%" }}
                initial={navEntryInitial}
                animate={article
                    ? (isDockVisible
                        ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
                        : { opacity: 0, y: -38, scale: 0.96, filter: "blur(8px)" })
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={article
                    ? (isDockVisible
                        ? { type: "spring", stiffness: 320, damping: 32, mass: 0.72 }
                        : { duration: 0.34, ease: [0.4, 0, 1, 1] })
                    : { duration: hasRouteEntry ? 0.62 : 0.52, ease: pageIntroEase }}
                onMouseEnter={() => {
                    if (!article) return;
                    setIsDockVisible(true);
                    setIsDockHovered(true);
                    clearDockHideTimer();
                }}
                onMouseLeave={() => {
                    if (!article) return;
                    setIsDockHovered(false);
                    scheduleDockHide(700);
                }}
            >
                <div className="relative flex items-center gap-1 rounded-full border border-white/55 bg-white/42 px-2 py-1.5 shadow-[0_30px_56px_-38px_rgba(14,30,66,0.8)] ring-1 ring-white/65 backdrop-blur-2xl">
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(115deg,rgba(255,255,255,0.56),rgba(255,255,255,0.18),rgba(255,255,255,0.4))]" />
                    <button
                        type="button"
                        onClick={() => handleRouteExit("home")}
                        className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-white/65 hover:text-slate-900"
                        title="Back to Welcome"
                    >
                        <House className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>

                    {/* Article List Back */}
                    {article && (
                        <button
                            onClick={() => {
                                setArticleTransitionMode("toPicker");
                                setArticle(null);
                                setIsWritingMode(false);
                                setIsEditMode(false);
                                setIsQuizMode(false);
                            }}
                            className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-white/65 hover:text-slate-900"
                            title="Back to Article Picker"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}

                    {/* Brand Pill */}
                    {!article && (
                        <div className="relative z-10 px-4 py-2 font-newsreader text-xl font-bold italic text-slate-900">
                            DeepSeek IELTS
                        </div>
                    )}

                    {/* Progress Ring & Brand (When Article Active) */}
                    {article && (
                        <div className="relative z-10 flex items-center gap-3 px-2">
                            {/* Nano Progress Ring */}
                            <div className="relative w-5 h-5 flex items-center justify-center">
                                {/* Track */}
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <path
                                        className="text-stone-200"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    {/* Indicator */}
                                    <path
                                        className="text-amber-500 transition-all duration-100 ease-out"
                                        strokeDasharray={`${scrollProgress * 100}, 100`}
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>

                            <div className="font-newsreader italic font-bold text-lg text-stone-800 hidden md:block">
                                DeepSeek IELTS
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    {article && <div className="w-px h-4 bg-stone-300/50 mx-1" />}

                    {/* Tools Group */}
                    <div className="flex items-center gap-1">
                        {/* Focus Mode Toggle */}
                        {article && (
                            <button
                                onClick={toggleFocusMode}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300",
                                    isFocusMode
                                        ? "bg-slate-900 text-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.45)] ring-1 ring-yellow-300/45"
                                        : "text-slate-500 hover:bg-white/65 hover:text-slate-800"
                                )}
                                title="Deep Focus Mode"
                            >
                                <Flashlight className={cn("w-4 h-4", isFocusMode && "fill-current")} />
                            </button>
                        )}

                        {/* Bionic Reading Toggle */}
                        {article && (
                            <button
                                onClick={toggleBionicMode}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300",
                                    isBionicMode
                                        ? "bg-slate-900 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.45)] ring-1 ring-cyan-300/45"
                                        : "text-slate-500 hover:bg-white/65 hover:text-slate-800"
                                )}
                                title="Bionic Reading"
                            >
                                <Eye className={cn("w-4 h-4", isBionicMode && "fill-current")} />
                            </button>
                        )}

                        {/* Theme Switcher */}
                        <div className="relative">
                            <button
                                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full transition-all",
                                    isThemeMenuOpen ? "bg-white/75 text-slate-900" : "text-slate-500 hover:bg-white/65 hover:text-slate-900"
                                )}
                                title="Appearance"
                            >
                                <Palette className="w-5 h-5" />
                            </button>

                            {isThemeMenuOpen && (
                                <AppearanceMenu onClose={() => setIsThemeMenuOpen(false)} />
                            )}
                        </div>

                        {article && (
                            <>
                                <button
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className={cn(
                                        "w-10 h-10 flex items-center justify-center rounded-full transition-all",
                                        isEditMode ? "bg-amber-100/90 text-amber-700" : "text-slate-500 hover:bg-white/65 hover:text-slate-900"
                                    )}
                                    title="Edit Text"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </button>

                                <button
                                    onClick={() => setIsWritingMode(true)}
                                    className="ml-1 flex h-10 items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 text-sm font-bold text-slate-700 shadow-[0_8px_22px_-16px_rgba(15,23,42,0.65)] transition-all hover:bg-white hover:text-slate-900"
                                >
                                    <PenTool className="w-4 h-4" />
                                    <span>Drill</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.nav>

            <motion.div
                className={cn("mt-20 transition-all duration-700", isWritingMode ? "h-[calc(100vh-120px)]" : "")}
                initial={contentEntryInitial}
                animate={routeExitTarget ? { opacity: 0, y: 10, scale: 0.993, filter: "blur(8px)" } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ delay: 0, duration: hasRouteEntry ? 0.68 : 0.56, ease: pageIntroEase }}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {!article ? (
                        <motion.div
                            key="picker"
                            className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 overflow-hidden pb-10"
                            initial={softReveal.initial}
                            animate={softReveal.animate}
                            exit={softReveal.exit}
                            transition={{ delay: 0.02, duration: hasRouteEntry ? 0.52 : 0.46, ease: pageIntroEase }}
                        >
                        {error && (
                            <LiquidGlassPanel className="rounded-xl px-4 py-2 text-center text-sm text-red-700">
                                {error}
                            </LiquidGlassPanel>
                        )}

                        {isLoading && (
                            <LiquidGlassPanel className="rounded-xl px-4 py-2 text-center text-sm text-cyan-700">
                                Loading article...
                            </LiquidGlassPanel>
                        )}

                        <motion.div
                            initial={{ opacity: 0, scale: 0.998 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.04, duration: hasRouteEntry ? 0.5 : 0.44, ease: pageIntroEase }}
                        >
                            <RecommendedArticles
                                onSelect={handleUrlSubmit}
                                onArticleLoaded={(data) => {
                                    setArticle(data as ArticleData);
                                }}
                            />
                        </motion.div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key={article.url || article.title}
                            initial={softReveal.initial}
                            animate={softReveal.animate}
                            exit={articleTransitionMode === "toPicker"
                                ? { opacity: 0, y: 8, scale: 0.994 }
                                : softReveal.exit}
                            transition={{ delay: 0.02, duration: hasRouteEntry ? 0.54 : 0.48, ease: pageIntroEase }}
                            className={cn(
                                "relative overflow-hidden",
                                "grid gap-8 h-full transition-all duration-500",
                                canShowQuizPanel
                                    ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_500px] 2xl:grid-cols-[minmax(0,1fr)_560px] xl:h-[calc(100vh-120px)] xl:overflow-hidden"
                                    : "grid-cols-1"
                            )}
                        >
                        {/* Reading Column */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.04, duration: hasRouteEntry ? 0.5 : 0.44, ease: pageIntroEase }}
                            className={cn(
                            "space-y-12 transition-all duration-700",
                            canShowQuizPanel && "xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1",
                            canShowQuizPanel ? "max-w-none" : "mx-auto max-w-3xl"
                        )}>
                            <ArticleDisplay
                                title={article.title}
                                content={article.content}
                                byline={article.byline}
                                blocks={article.blocks}
                                siteName={article.siteName}
                                videoUrl={article.videoUrl}
                                articleUrl={article.url}
                                isEditMode={isEditMode}
                                locateRequest={quizLocateRequest}
                            />

                            {/* Quiz Entry Button - only for AI generated articles */}
                            {article.isAIGenerated && article.difficulty && !isQuizMode && (
                                <div className="flex justify-center pb-8">
                                    <button
                                        onClick={() => setIsQuizMode(true)}
                                        className="group flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-8 py-4 font-bold text-slate-800 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.6)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-[0_28px_52px_-20px_rgba(15,23,42,0.75)]"
                                    >
                                        <ClipboardCheck className="h-5 w-5 text-pink-500 transition-transform group-hover:scale-110" />
                                        <span>开始答题</span>
                                        <span className={cn(
                                            "rounded-md border px-2 py-0.5 text-[10px] font-bold",
                                            article.difficulty === 'cet4' && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                            article.difficulty === 'cet6' && "border-blue-200 bg-blue-50 text-blue-700",
                                            article.difficulty === 'ielts' && "border-violet-200 bg-violet-50 text-violet-700"
                                        )}>
                                            {article.difficulty === 'cet4' ? '四级' : article.difficulty === 'cet6' ? '六级' : '雅思'}
                                        </span>
                                    </button>
                                </div>
                            )}

                            <div className="hidden sticky bottom-8 z-40 animate-in slide-in-from-bottom-10 duration-700">
                                <AudioPlayer text={article.textContent || ""} />
                            </div>
                        </motion.div>

                        {/* Quiz Sidebar */}
                        {canShowQuizPanel && (
                            <motion.div
                                className="xl:h-full xl:min-h-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.06, duration: hasRouteEntry ? 0.52 : 0.46, ease: pageIntroEase }}
                            >
                                <LiquidGlassPanel className="h-full min-h-0 overflow-hidden rounded-[24px] [&>.liquid-glass-content]:h-full [&>.liquid-glass-content]:min-h-0">
                                    <ReadingQuizPanel
                                        articleContent={article.textContent || article.content}
                                        articleTitle={article.title}
                                        difficulty={article.difficulty as 'cet4' | 'cet6' | 'ielts'}
                                        onClose={() => setIsQuizMode(false)}
                                        cachedQuestions={quizCacheKey ? quizCache[quizCacheKey] : undefined}
                                        onQuestionsReady={(questions) => {
                                            if (!quizCacheKey || !quizDbKey) return;
                                            setQuizCache((prev) => ({ ...prev, [quizCacheKey]: questions }));
                                            void (async () => {
                                                try {
                                                    const { db } = await import("@/lib/db");
                                                    const existing = await db.ai_cache.where("[key+type]").equals([quizDbKey, "quiz"]).first();
                                                    await db.ai_cache.put({
                                                        id: existing?.id,
                                                        key: quizDbKey,
                                                        type: "quiz",
                                                        data: { questions },
                                                        timestamp: Date.now(),
                                                    });
                                                } catch (error) {
                                                    console.error("Failed to persist quiz cache:", error);
                                                }
                                            })();
                                        }}
                                        onSubmitScore={({ correct, total }) => {
                                            const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
                                            setArticle((prev) => {
                                                if (!prev) return prev;
                                                return {
                                                    ...prev,
                                                    quizCompleted: true,
                                                    quizCorrect: correct,
                                                    quizTotal: total,
                                                    quizScorePercent: scorePercent,
                                                };
                                            });

                                            if (article?.url) {
                                                void (async () => {
                                                    try {
                                                        const { db } = await import("@/lib/db");
                                                        await db.articles.update(article.url, {
                                                            quizCompleted: true,
                                                            quizCorrect: correct,
                                                            quizTotal: total,
                                                            quizScorePercent: scorePercent,
                                                            timestamp: Date.now(),
                                                        });
                                                    } catch (error) {
                                                        console.error("Failed to persist quiz score:", error);
                                                    }
                                                })();
                                            }
                                        }}
                                        onLocate={({ questionNumber, sourceParagraph, evidence }) => {
                                            const paragraphNumber = parseParagraphNumber(sourceParagraph);
                                            if (!paragraphNumber) return;
                                            setQuizLocateRequest({
                                                requestId: Date.now(),
                                                questionNumber,
                                                paragraphNumber,
                                                evidence,
                                            });
                                        }}
                                    />
                                </LiquidGlassPanel>
                            </motion.div>
                        )}

                        {/* Writing Overlay */}
                        {isWritingMode && (
                            <WritingEditor
                                articleTitle={article.title}
                                articleContent={article.textContent || article.content}
                                onClose={() => setIsWritingMode(false)}
                            />
                        )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
            </div>
        </main >
    );
}

export default function ReadingPage() {
    return (
        <ReadingSettingsProvider>
            <ReadingPageContent />
        </ReadingSettingsProvider>
    );
}
