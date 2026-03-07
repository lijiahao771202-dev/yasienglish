import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface GhostTextareaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    getPrediction?: (currentText: string) => string;
    predictionWordCount?: number;
    className?: string;
}

export function GhostTextarea({
    value,
    onChange,
    placeholder = "Type here...",
    disabled = false,
    getPrediction,
    predictionWordCount = 2,
    className
}: GhostTextareaProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [predictionEnabled, setPredictionEnabled] = useState(true);
    const [ghostText, setGhostText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!predictionEnabled || !getPrediction || !value.trim() || disabled) {
            setGhostText('');
            return;
        }

        const predicted = getPrediction(value);
        if (predicted && predicted.toLowerCase().startsWith(value.toLowerCase())) {
            const remaining = predicted.slice(value.length);
            const match = remaining.match(new RegExp(`^(\\s*\\S+){1,${predictionWordCount}}`));
            setGhostText(match ? match[0] : remaining);
        } else {
            setGhostText('');
        }
    }, [value, predictionEnabled, getPrediction, disabled, predictionWordCount]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghostText) {
            e.preventDefault();
            onChange(value + ghostText);
            setGhostText('');
        }
    };

    const typographyClass = className || "p-6 text-xl font-medium font-sans leading-[1.8] tracking-[0.015em] min-h-[160px]";

    return (
        <div className="relative w-full flex flex-col group/ghost">
            {getPrediction && (
                <div className="absolute top-4 right-4 z-20 flex items-center justify-end pointer-events-auto">
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setPredictionEnabled(!predictionEnabled)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm border backdrop-blur-md",
                            predictionEnabled
                                ? "bg-indigo-50/80 text-indigo-600 border-indigo-200/50 hover:bg-indigo-100"
                                : "bg-white/40 text-stone-400 border-stone-200/50 hover:bg-white/60"
                        )}
                    >
                        {predictionEnabled ? <Sparkles className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 opacity-50" />}
                        AI Predict
                        <span className={cn(
                            "w-1.5 h-1.5 rounded-full ml-1",
                            predictionEnabled ? "bg-indigo-500 animate-pulse" : "bg-stone-300"
                        )} />
                    </button>
                </div>
            )}

            <div className="relative w-full">
                <div
                    className={cn(
                        "absolute inset-0 pointer-events-none whitespace-pre-wrap break-words text-left bg-transparent",
                        typographyClass
                    )}
                    aria-hidden="true"
                >
                    <span className="opacity-0">{value}</span>
                    {ghostText && (
                        <span className="text-indigo-400/50 dark:text-indigo-500/50 font-semibold selection:bg-transparent">
                            {ghostText}
                        </span>
                    )}
                </div>

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={cn(
                        "relative z-10 w-full resize-none outline-none bg-transparent text-left",
                        "text-stone-800 dark:text-stone-200",
                        "placeholder:text-stone-300/80 dark:placeholder:text-white/20",
                        typographyClass
                    )}
                    spellCheck={false}
                />
            </div>

            {ghostText && isFocused && (
                <div className="absolute bottom-6 right-6 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-500/80 bg-indigo-50/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-[0_4px_20px_rgba(99,102,241,0.15)] border border-indigo-100/50">
                        Press <kbd className="bg-white border border-indigo-100/80 rounded px-1.5 py-0.5 font-sans shadow-sm text-indigo-600">Tab</kbd> to accept
                    </div>
                </div>
            )}
        </div>
    );
}
