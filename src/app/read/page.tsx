"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArticleDisplay } from "@/components/reading/ArticleDisplay";
import { AudioPlayer } from "@/components/shadowing/AudioPlayer";
import { WritingEditor } from "@/components/writing/WritingEditor";
import { RecommendedArticles, ArticleItem } from "@/components/reading/RecommendedArticles";
import { ArticleSidebar } from "@/components/reading/ArticleSidebar";
import { ReadingQuizPanel } from "@/components/reading/ReadingQuizPanel";
import { PenTool, ArrowLeft, House, Palette, Edit3, Flashlight, Eye, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { useUserStore } from "@/lib/store";
import { resolveDailyArticleCandidate } from "@/lib/dailyArticle";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";

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


import { ReadingSettingsProvider, useReadingSettings, READING_THEMES } from "@/contexts/ReadingSettingsContext";
import { AppearanceMenu } from "@/components/reading/AppearanceMenu";

function ReadingPageContent() {
    const [isLoading, setIsLoading] = useState(false);
    const [article, setArticle] = useState<ArticleData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWritingMode, setIsWritingMode] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isQuizMode, setIsQuizMode] = useState(false);
    const { loadUserData, markArticleAsRead } = useUserStore();

    // Context Settings
    const { theme, fontClass, isFocusMode, toggleFocusMode, isBionicMode, toggleBionicMode } = useReadingSettings();
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

    // Scroll Progress
    const [scrollProgress, setScrollProgress] = useState(0);

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

    // Sidebar State
    const [sidebarArticles, setSidebarArticles] = useState<ArticleItem[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentUrl, setCurrentUrl] = useState<string>("");
    const canShowQuizPanel = Boolean(isQuizMode && article?.isAIGenerated && article?.difficulty);

    useEffect(() => {
        if (isQuizMode && (!article?.isAIGenerated || !article?.difficulty)) {
            setIsQuizMode(false);
        }
    }, [isQuizMode, article?.isAIGenerated, article?.difficulty]);

    const handleUrlSubmit = async (url: string) => {
        setIsLoading(true);
        setError(null);
        setCurrentUrl(url);
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
                    url: cached.url
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

            // Auto-open sidebar if we have articles to show context
            if (sidebarArticles.length > 0 && !isSidebarOpen) {
                setIsSidebarOpen(true);
            }
        } catch (err) {
            console.error(err);
            setError("Failed to load article. Please check the URL and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className={cn(
            "relative min-h-screen overflow-x-clip p-6 text-stone-800 transition-all duration-500 ease-in-out md:p-12",
            READING_THEMES.find(t => t.id === theme)?.class,
            fontClass, // Apply Font Global
            isSidebarOpen ? "md:pl-96" : ""
        )}>
            {!article && (
                <>
                    <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_18%,rgba(34,211,238,0.3),transparent_36%),radial-gradient(circle_at_82%_12%,rgba(139,92,246,0.27),transparent_34%),radial-gradient(circle_at_70%_82%,rgba(45,212,191,0.22),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.86),rgba(247,250,255,0.84),rgba(242,255,251,0.82))]" />
                    <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_30%_45%,rgba(255,255,255,0.7),transparent_56%)] backdrop-blur-[6px]" />
                    <div
                        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.025] mix-blend-overlay"
                        style={{
                            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                        }}
                    />
                </>
            )}

            {/* Sidebar */}
            <ArticleSidebar
                articles={sidebarArticles}
                currentUrl={currentUrl}
                onSelect={handleUrlSubmit}
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
            />

            {/* Floating Navigation Dock */}
            <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500">
                <div className="relative flex items-center gap-1 rounded-full border border-white/55 bg-white/42 px-2 py-1.5 shadow-[0_30px_56px_-38px_rgba(14,30,66,0.8)] ring-1 ring-white/65 backdrop-blur-2xl">
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(115deg,rgba(255,255,255,0.56),rgba(255,255,255,0.18),rgba(255,255,255,0.4))]" />
                    <Link
                        href="/"
                        className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-white/65 hover:text-slate-900"
                        title="Back to Welcome"
                    >
                        <House className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    </Link>

                    {/* Article List Back */}
                    {article && (
                        <button
                            onClick={() => {
                                setArticle(null);
                                setCurrentUrl("");
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
            </nav>

            <div className={cn("mt-20 transition-all duration-700", isWritingMode ? "h-[calc(100vh-120px)]" : "")}>
                {!article ? (
                    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-10">
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

                        <RecommendedArticles
                            onSelect={handleUrlSubmit}
                            onArticleLoaded={(data) => {
                                setArticle(data as ArticleData);
                            }}
                            onListUpdate={setSidebarArticles}
                        />
                    </div>
                ) : (
                    <div className={cn(
                        "grid gap-8 h-full transition-all duration-500",
                        canShowQuizPanel
                            ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_500px] 2xl:grid-cols-[minmax(0,1fr)_560px] xl:h-[calc(100vh-120px)] xl:overflow-hidden"
                            : "grid-cols-1"
                    )}>
                        {/* Reading Column */}
                        <div className={cn(
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
                        </div>

                        {/* Quiz Sidebar */}
                        {canShowQuizPanel && (
                            <div className="xl:h-full xl:min-h-0">
                                <LiquidGlassPanel className="h-full min-h-0 overflow-hidden rounded-[24px] [&>.liquid-glass-content]:h-full [&>.liquid-glass-content]:min-h-0">
                                    <ReadingQuizPanel
                                        articleContent={article.textContent || article.content}
                                        articleTitle={article.title}
                                        difficulty={article.difficulty as 'cet4' | 'cet6' | 'ielts'}
                                        onClose={() => setIsQuizMode(false)}
                                    />
                                </LiquidGlassPanel>
                            </div>
                        )}

                        {/* Writing Overlay */}
                        {isWritingMode && (
                            <WritingEditor
                                articleTitle={article.title}
                                articleContent={article.textContent || article.content}
                                onClose={() => setIsWritingMode(false)}
                            />
                        )}
                    </div>
                )}
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
