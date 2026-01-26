"use client";

import { useState } from "react";
import { UrlInput } from "@/components/reading/UrlInput";
import { ArticleDisplay } from "@/components/reading/ArticleDisplay";
import { AudioPlayer } from "@/components/shadowing/AudioPlayer";
import { WritingEditor } from "@/components/writing/WritingEditor";
import { RecommendedArticles, ArticleItem } from "@/components/reading/RecommendedArticles";
import { ArticleSidebar } from "@/components/reading/ArticleSidebar";
import { PenTool, ArrowLeft, Palette, Check, Edit3, Flashlight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { useUserStore } from "@/lib/store";
import { useEffect } from "react";

interface ArticleData {
    title: string;
    content: string;
    byline?: string;
    textContent?: string;
    blocks?: any[];
    url?: string; // Track current URL for sidebar highlighting
    siteName?: string; // For TED video sync
    videoUrl?: string; // TED video URL
    image?: string | null;
}


import { ReadingSettingsProvider, useReadingSettings, READING_THEMES } from "@/contexts/ReadingSettingsContext";
import { AppearanceMenu } from "@/components/reading/AppearanceMenu";

function ReadingPageContent() {
    const [isLoading, setIsLoading] = useState(false);
    const [article, setArticle] = useState<ArticleData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWritingMode, setIsWritingMode] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const { loadUserData, markArticleAsRead } = useUserStore();

    // Context Settings
    const { theme, fontClass, fontSizeClass, isFocusMode, toggleFocusMode, isBionicMode, toggleBionicMode } = useReadingSettings();
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

            // 1. Try to restore last reading session first
            const lastArticle = await db.articles.orderBy('timestamp').last();
            if (lastArticle && !article) {
                console.log("Restoring last article:", lastArticle.title);
                setArticle({
                    title: lastArticle.title,
                    content: lastArticle.content,
                    textContent: lastArticle.textContent,
                    byline: lastArticle.byline,
                    siteName: lastArticle.siteName,
                    blocks: lastArticle.blocks,
                    url: lastArticle.url
                });
                setCurrentUrl(lastArticle.url);
            }

            // 2. Daily Fetch Check
            if (lastFetchDate !== today) {
                console.log("Triggering daily article fetch...");
                try {
                    // Fetch feed list
                    const feedRes = await axios.get('/api/feed?category=news');
                    if (feedRes.data && feedRes.data.length > 0) {
                        // FIX: Use .link or .url depending on feed structure (API returns .link)
                        const dailyUrl = feedRes.data[0].link || feedRes.data[0].url;

                        if (!dailyUrl) {
                            console.error("Daily article missing URL", feedRes.data[0]);
                            return;
                        }

                        // Check if we already have it
                        const existing = await db.articles.get({ url: dailyUrl });
                        if (!existing) {
                            console.log("Downloading new daily article:", dailyUrl);
                            // Download and cache
                            const parseRes = await axios.post("/api/parse", { url: dailyUrl });
                            const articleData = { ...parseRes.data, url: dailyUrl };

                            await db.articles.put({
                                url: dailyUrl,
                                title: articleData.title,
                                content: articleData.content,
                                textContent: articleData.textContent,
                                byline: articleData.byline,
                                siteName: articleData.siteName,
                                blocks: articleData.blocks,
                                image: articleData.image,
                                timestamp: Date.now()
                            });

                            console.log("Daily article saved.");
                        }
                    }
                    localStorage.setItem('last_daily_fetch_date', today);
                } catch (err) {
                    console.error("Daily fetch failed:", err);
                }
            }
        };

        checkDailyArticle();
    }, [loadUserData]);

    // Sidebar State
    const [sidebarArticles, setSidebarArticles] = useState<ArticleItem[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentUrl, setCurrentUrl] = useState<string>("");

    const handleUrlSubmit = async (url: string) => {
        console.log('handleUrlSubmit called with:', url);
        setIsLoading(true);
        setError(null);
        setCurrentUrl(url);
        try {
            // Check cache first
            const { db } = await import("@/lib/db");
            const cached = await db.articles.get({ url });

            if (cached) {
                console.log("Loaded from cache:", cached.title);
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
            console.log('Setting article with URL:', finalUrl);

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
            "min-h-screen text-stone-800 p-6 md:p-12 transition-all duration-500 ease-in-out",
            READING_THEMES.find(t => t.id === theme)?.class,
            fontClass, // Apply Font Global
            isSidebarOpen ? "md:pl-96" : ""
        )}>
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
                <div className="glass-panel bg-white/70 backdrop-blur-xl rounded-full px-2 py-1.5 flex items-center gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/50 ring-1 ring-black/5">

                    {/* Home / Back */}
                    {article && (
                        <button
                            onClick={() => {
                                setArticle(null);
                                setCurrentUrl("");
                                setIsWritingMode(false);
                                setIsEditMode(false);
                            }}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-900 hover:bg-white/80 transition-all group"
                            title="Back to Home"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}

                    {/* Brand Pill */}
                    {!article && (
                        <div className="px-4 py-2 font-newsreader italic font-bold text-xl text-stone-800">
                            DeepSeek IELTS
                        </div>
                    )}

                    {/* Progress Ring & Brand (When Article Active) */}
                    {article && (
                        <div className="flex items-center gap-3 px-2">
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
                                        ? "bg-stone-800 text-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)] ring-1 ring-yellow-400/50"
                                        : "text-stone-400 hover:text-stone-600 hover:bg-stone-100/50"
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
                                        ? "bg-stone-800 text-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)] ring-1 ring-blue-400/50"
                                        : "text-stone-400 hover:text-stone-600 hover:bg-stone-100/50"
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
                                    isThemeMenuOpen ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900 hover:bg-white/50"
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
                                        isEditMode ? "bg-amber-100 text-amber-700" : "text-stone-500 hover:text-stone-900 hover:bg-white/50"
                                    )}
                                    title="Edit Text"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </button>

                                <button
                                    onClick={() => setIsWritingMode(!isWritingMode)}
                                    className={cn(
                                        "px-4 h-10 rounded-full text-sm font-bold flex items-center gap-2 transition-all ml-1",
                                        isWritingMode
                                            ? "bg-stone-900 text-white shadow-lg"
                                            : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
                                    )}
                                >
                                    {isWritingMode ? (
                                        <>Close Writer</>
                                    ) : (
                                        <>
                                            <PenTool className="w-4 h-4" />
                                            <span>Write</span>
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            <div className={cn("mt-20 transition-all duration-700", isWritingMode ? "h-[calc(100vh-120px)]" : "")}>
                {!article ? (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12">
                        <div className="w-full max-w-xl">
                            <UrlInput onSubmit={handleUrlSubmit} isLoading={isLoading} />
                            {error && (
                                <p className="mt-4 text-red-400 bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20 text-center">
                                    {error}
                                </p>
                            )}
                        </div>

                        <RecommendedArticles
                            onSelect={handleUrlSubmit}
                            onArticleLoaded={(data) => {
                                setArticle(data);
                                // If generated, we might not have a URL, but that's fine
                            }}
                            onListUpdate={setSidebarArticles}
                        />
                    </div>
                ) : (
                    <div className={cn("grid gap-8 h-full", isWritingMode ? "grid-cols-2" : "grid-cols-1")}>
                        {/* Reading Column */}
                        <div className={cn("space-y-12 transition-all duration-700", isWritingMode ? "overflow-y-auto pr-4 custom-scrollbar" : "")}>
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
                            {!isWritingMode && (
                                <div className="hidden sticky bottom-8 z-40 animate-in slide-in-from-bottom-10 duration-700">
                                    <AudioPlayer text={article.textContent || ""} />
                                </div>
                            )}
                        </div>

                        {/* Writing Column */}
                        {isWritingMode && (
                            <div className="h-full">
                                <WritingEditor articleTitle={article.title} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}

export default function ReadingPage() {
    return (
        <ReadingSettingsProvider>
            <ReadingPageContent />
        </ReadingSettingsProvider>
    );
}

