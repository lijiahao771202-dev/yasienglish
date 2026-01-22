"use client";

import { useState } from "react";
import { UrlInput } from "@/components/reading/UrlInput";
import { ArticleDisplay } from "@/components/reading/ArticleDisplay";
import { AudioPlayer } from "@/components/shadowing/AudioPlayer";
import { WritingEditor } from "@/components/writing/WritingEditor";
import { RecommendedArticles, ArticleItem } from "@/components/reading/RecommendedArticles";
import { ArticleSidebar } from "@/components/reading/ArticleSidebar";
import { PenTool, ArrowLeft, Palette, Check, Edit3 } from "lucide-react";
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
}

export default function ReadingPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [article, setArticle] = useState<ArticleData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWritingMode, setIsWritingMode] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const { loadUserData } = useUserStore();

    // Theme State
    const [theme, setTheme] = useState('warm');
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

    const themes = [
        { id: 'warm', name: 'Warm Paper', class: 'bg-gradient-to-br from-orange-50 via-white to-rose-50', dot: 'bg-orange-300' },
        { 
            id: 'sunlight', 
            name: 'Morning Sun', 
            // Simplified high-contrast gradients for better browser compatibility and visibility
            class: 'bg-[#F2EFE9] bg-[radial-gradient(circle_at_90%_10%,_rgba(255,255,255,1)_0%,_rgba(255,250,235,0.8)_30%,_rgba(235,230,220,0)_60%)]', 
            dot: 'bg-amber-400' 
        },
        { 
            id: 'vintage', 
            name: 'Aged Book', 
            class: 'bg-[#EBE5D9] bg-[linear-gradient(135deg,_rgba(0,0,0,0.02)_25%,_transparent_25%,_transparent_50%,_rgba(0,0,0,0.02)_50%,_rgba(0,0,0,0.02)_75%,_transparent_75%,_transparent_100%)] bg-[length:4px_4px]', 
            dot: 'bg-stone-400' 
        },
        { id: 'green', name: 'Eye Care', class: 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50', dot: 'bg-emerald-300' },
        { id: 'cool', name: 'Cool Mist', class: 'bg-gradient-to-br from-slate-50 via-blue-50 to-sky-50', dot: 'bg-blue-300' },
        { id: 'mono', name: 'Minimal', class: 'bg-gradient-to-br from-stone-50 via-white to-stone-100', dot: 'bg-stone-300' },
    ];

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
                        const dailyUrl = feedRes.data[0].url;
                        
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
                setIsLoading(false);
                return;
            }

            const response = await axios.post("/api/parse", { url });
            const finalUrl = response.data.url || url;
            console.log('Setting article with URL:', finalUrl);
            
            const articleData = { ...response.data, url: finalUrl };
            setArticle(articleData);

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
            themes.find(t => t.id === theme)?.class,
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

            {/* Navbar Placeholder */}
            <nav className={cn(
                "fixed top-0 left-0 w-full p-6 flex justify-between items-center z-30 pointer-events-none transition-all duration-500",
                isSidebarOpen ? "md:pl-96" : ""
            )}>
                <div className="flex items-center gap-3 pointer-events-auto">
                    {article && (
                        <button 
                            onClick={() => {
                                setArticle(null);
                                setCurrentUrl("");
                                setIsWritingMode(false);
                                setIsEditMode(false);
                                // Optional: Clear URL param if we were using router
                            }}
                            className="glass-button w-9 h-9 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-800 hover:bg-white/80 transition-all shadow-sm group"
                            title="Back to Home"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}
                    <div className="glass-button px-4 py-2 rounded-full text-sm font-bold text-amber-600 border-amber-200/50 shadow-sm">
                        DeepSeek IELTS
                    </div>
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    {/* Theme Switcher */}
                    <div className="relative">
                        <button
                            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                            className="glass-button w-9 h-9 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-800 hover:bg-white/80 transition-all shadow-sm"
                            title="Change Background"
                        >
                            <Palette className="w-4 h-4" />
                        </button>
                        
                        {isThemeMenuOpen && (
                            <div className="absolute top-full right-0 mt-3 w-48 glass-panel p-1.5 rounded-xl flex flex-col gap-1 shadow-xl animate-in fade-in zoom-in-95 z-50 border border-white/50">
                                {themes.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => { setTheme(t.id); setIsThemeMenuOpen(false); }}
                                        className={cn(
                                            "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                                            theme === t.id 
                                                ? "bg-white shadow-sm text-stone-800" 
                                                : "text-stone-500 hover:bg-white/50 hover:text-stone-700"
                                        )}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm ring-1 ring-black/5", t.dot)} />
                                            {t.name}
                                        </div>
                                        {theme === t.id && <Check className="w-3.5 h-3.5 text-stone-800" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {article && (
                        <div className="flex gap-2">
                            {/* Edit Mode Toggle */}
                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={cn(
                                    "glass-button px-3 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all shadow-sm",
                                    isEditMode 
                                        ? "bg-amber-100 text-amber-700 border-amber-200" 
                                        : "text-stone-500 hover:text-stone-800 hover:bg-white/80"
                                )}
                                title="Toggle Edit Mode"
                            >
                                <Edit3 className="w-4 h-4" />
                                {isEditMode && <span className="text-xs">Editing</span>}
                            </button>

                            <button
                                onClick={() => setIsWritingMode(!isWritingMode)}
                                className="glass-button px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-all hover:bg-white/80 shadow-sm"
                            >
                                {isWritingMode ? (
                                    <>
                                        <ArrowLeft className="w-4 h-4" /> Back to Reading
                                    </>
                                ) : (
                                    <>
                                        <PenTool className="w-4 h-4" /> Start Writing
                                    </>
                                )}
                            </button>
                        </div>
                    )}
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
                                <div className="sticky bottom-8 z-40 animate-in slide-in-from-bottom-10 duration-700">
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
