"use client";

import { useUserStore } from "@/lib/store";
import { BookOpen, PenTool, TrendingUp, Clock, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
    const { vocabulary, writingHistory, readArticleUrls } = useUserStore();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'vocab' | 'writing'>('vocab');

    // Prevent hydration mismatch for persisted store
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <main className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 text-stone-200 p-6 md:p-12">
            <nav className="fixed top-0 left-0 w-full p-6 flex justify-between items-center z-50 pointer-events-none">
                <div className="glass-button pointer-events-auto px-4 py-2 rounded-full text-sm font-bold text-amber-400">
                    DeepSeek IELTS
                </div>
                <a href="/read" className="glass-button pointer-events-auto px-4 py-2 rounded-full text-sm font-medium text-stone-300 hover:text-white">
                    Back to Reading
                </a>
            </nav>

            <div className="mt-20 max-w-6xl mx-auto space-y-12">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
                        <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400">
                            <BookOpen className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-stone-400">Words Learned</p>
                            <h3 className="text-2xl font-bold text-stone-100">{vocabulary.length}</h3>
                        </div>
                    </div>
                    <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
                        <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400">
                            <PenTool className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-stone-400">Essays Written</p>
                            <h3 className="text-2xl font-bold text-stone-100">{writingHistory.length}</h3>
                        </div>
                    </div>
                    <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
                        <div className="p-3 bg-orange-500/20 rounded-xl text-orange-400">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-stone-400">Articles Read</p>
                            <h3 className="text-2xl font-bold text-stone-100">{readArticleUrls.length}</h3>
                        </div>
                    </div>
                </div>

                {/* Main Content Tabs */}
                <div className="space-y-6">
                    <div className="flex gap-4 border-b border-white/10 pb-2">
                        <button
                            onClick={() => setActiveTab('vocab')}
                            className={cn("pb-2 px-2 text-sm font-medium transition-colors relative", activeTab === 'vocab' ? "text-amber-400" : "text-stone-400 hover:text-stone-200")}
                        >
                            Vocabulary Bank
                            {activeTab === 'vocab' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-400 rounded-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('writing')}
                            className={cn("pb-2 px-2 text-sm font-medium transition-colors relative", activeTab === 'writing' ? "text-rose-400" : "text-stone-400 hover:text-stone-200")}
                        >
                            Writing History
                            {activeTab === 'writing' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-rose-400 rounded-full" />}
                        </button>
                    </div>

                    {activeTab === 'vocab' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {vocabulary.length === 0 ? (
                                <div className="col-span-full text-center py-20 text-stone-500">
                                    No words saved yet. Start reading articles and clicking words!
                                </div>
                            ) : (
                                vocabulary.map((item, i) => (
                                    <div key={i} className="glass-panel p-5 rounded-xl space-y-3 hover:border-amber-500/30 transition-colors group">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-lg font-bold text-amber-100">{item.word}</h4>
                                            <span className="text-xs text-stone-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm text-rose-300">{item.translation}</p>
                                        <p className="text-sm text-stone-300 line-clamp-2">{item.definition}</p>
                                        <div className="pt-2 border-t border-white/5">
                                            <p className="text-xs text-stone-400 italic line-clamp-2">"{item.context}"</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {writingHistory.length === 0 ? (
                                <div className="text-center py-20 text-stone-500">
                                    No essays written yet. Go to the reading page and start a writing task!
                                </div>
                            ) : (
                                writingHistory.map((entry, i) => (
                                    <div key={i} className="glass-panel p-6 rounded-xl space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-lg font-semibold text-stone-100">{entry.articleTitle}</h4>
                                                <p className="text-xs text-stone-500 flex items-center gap-1 mt-1">
                                                    <Clock className="w-3 h-3" /> {new Date(entry.timestamp).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-2xl font-bold text-rose-400">{entry.score}</span>
                                                <span className="text-xs text-stone-500">Score</span>
                                            </div>
                                        </div>
                                        <div className="bg-black/20 p-4 rounded-lg">
                                            <p className="text-sm text-stone-300 whitespace-pre-wrap line-clamp-3 hover:line-clamp-none transition-all cursor-pointer">
                                                {entry.content}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
