"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/lib/store";

interface WritingEditorProps {
    articleTitle: string;
}

interface FeedbackData {
    score: number;
    comments: string[];
}

export function WritingEditor({ articleTitle }: WritingEditorProps) {
    const [content, setContent] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackData | null>(null);

    const handleAnalyze = async () => {
        if (!content.trim()) return;
        setIsAnalyzing(true);

        try {
            const response = await fetch("/api/ai/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, articleTitle }),
            });

            const data = await response.json();
            setFeedback(data);

            // Save to writing history
            // Save to writing history
            if (data && data.score) {
                useUserStore.getState().addWritingHistory({
                    articleTitle,
                    content,
                    score: data.score,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error(error);
            setFeedback({
                score: 0,
                comments: ["Failed to analyze writing. Please try again."]
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4 animate-in slide-in-from-right-10 duration-700">
            <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-cyan-100">Writing Task</h3>
                        <p className="text-xs text-slate-400">Based on: {articleTitle}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing || !content}
                            className="glass-button px-4 py-2 rounded-lg text-sm flex items-center gap-2 text-purple-300 hover:text-purple-200"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Sparkles className="w-4 h-4 animate-spin" /> Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" /> AI Check
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Summarize the article or write your thoughts here..."
                    className="flex-1 bg-transparent border-none resize-none focus:ring-0 text-slate-200 placeholder:text-slate-600 leading-relaxed p-0"
                    spellCheck={false}
                />
            </div>

            {feedback && (
                <div className="glass-panel p-6 rounded-2xl space-y-4 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-cyan-100">AI Feedback</h4>
                        <span className="text-2xl font-bold text-cyan-400">{feedback.score} <span className="text-sm text-slate-500 font-normal">/ 9.0</span></span>
                    </div>
                    <ul className="space-y-2">
                        {feedback.comments.map((comment, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                {comment.toLowerCase().includes("good") || comment.toLowerCase().includes("excellent") ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                                )}
                                {comment}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
