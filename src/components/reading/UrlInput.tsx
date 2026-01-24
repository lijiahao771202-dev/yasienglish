"use client";

import { useState } from "react";
import { ArrowRight, Link as LinkIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UrlInputProps {
    onSubmit: (url: string) => Promise<void>;
    isLoading: boolean;
}

export function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
    const [url, setUrl] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url.trim()) {
            onSubmit(url);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-6 relative z-10">
                <h2 className="text-6xl font-medium font-newsreader text-stone-900 tracking-tight leading-tight">
                    What are we reading today?
                </h2>
                <p className="font-inter font-light text-stone-600 max-w-lg mx-auto leading-relaxed text-lg">
                    Paste a URL from The Economist, Nature, or Psychology Today to begin your deep reading session.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="relative group max-w-xl mx-auto">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-400/30 via-rose-400/30 to-amber-400/30 rounded-full blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-1000" />
                <div className="relative flex items-center glass-panel rounded-full p-2 transition-all duration-300 group-hover:scale-[1.01] group-hover:bg-white/80 border-white/60">
                    <div className="pl-6 text-stone-400">
                        <LinkIcon className="w-5 h-5" />
                    </div>
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-stone-800 placeholder:text-stone-400/70 px-4 py-4 text-lg font-medium font-inter"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className={cn(
                            "px-8 py-4 rounded-full text-stone-900 font-bold bg-white shadow-sm border border-stone-100 flex items-center gap-2 hover:bg-stone-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                            isLoading && "opacity-70"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Start <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
