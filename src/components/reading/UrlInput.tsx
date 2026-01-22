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
            <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-rose-500">
                    What are we reading today?
                </h2>
                <p className="text-stone-500">
                    Paste a URL from The Economist, Nature, or Psychology Today.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-rose-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                <div className="relative flex items-center glass-panel rounded-2xl p-2">
                    <div className="pl-4 text-stone-400">
                        <LinkIcon className="w-5 h-5" />
                    </div>
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-stone-800 placeholder:text-stone-400 px-4 py-3"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className={cn(
                            "glass-button px-6 py-3 rounded-xl text-stone-700 font-medium flex items-center gap-2 hover:bg-amber-100 hover:text-amber-700",
                            isLoading && "opacity-70 cursor-not-allowed"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Start <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
