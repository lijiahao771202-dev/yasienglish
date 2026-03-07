import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface GhostTextareaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    sourceText?: string;
    referenceAnswer?: string;
    predictionWordCount?: number;
    className?: string;
}

export function GhostTextarea({
    value,
    onChange,
    placeholder = "Type here...",
    disabled = false,
    sourceText,
    referenceAnswer,
    predictionWordCount = 2,
    className
}: GhostTextareaProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [ghostText, setGhostText] = useState('');
    const [isPredicting, setIsPredicting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const localCache = useRef<Record<string, string>>({});

    const triggerPrediction = async (currentInputValue: string) => {
        if (!currentInputValue.trim() || disabled || (!sourceText && !referenceAnswer)) {
            setGhostText('');
            setIsPredicting(false);
            return;
        }

        // Check Local AI Memory for this exact input state
        const inputKey = currentInputValue.toLowerCase();
        if (localCache.current[inputKey] !== undefined) {
            setGhostText(localCache.current[inputKey]);
            setIsPredicting(false);
            return;
        }

        // Trigger LLM
        setGhostText('');
        setIsPredicting(true);
        if (textareaRef.current) {
            textareaRef.current.dataset.prevInput = currentInputValue;
            textareaRef.current.dataset.prevGhost = '';
        }

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        try {
            const res = await fetch('/api/ai/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceText,
                    currentInput: currentInputValue,
                    referenceAnswer
                }),
                signal: abortControllerRef.current.signal
            });

            if (res.ok) {
                const data = await res.json();
                let aiSuggestion = data.prediction || "";

                // Post-process the AI prediction to ensure it fits nicely
                if (aiSuggestion) {
                    const remaining = aiSuggestion;
                    const match = remaining.match(new RegExp(`^(\\s*\\S+){1,${predictionWordCount}}`));
                    aiSuggestion = match ? match[0] : remaining;
                }

                // Save to local dictionary cache
                localCache.current[inputKey] = aiSuggestion;

                // Only update state if user hasn't typed more during the await
                if (textareaRef.current?.value === currentInputValue) {
                    setGhostText(aiSuggestion);
                    textareaRef.current.dataset.prevInput = currentInputValue;
                    textareaRef.current.dataset.prevGhost = aiSuggestion;
                    setIsPredicting(false);
                }
            } else {
                setIsPredicting(false);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                // Ignored intentionally, since it means user is typing
                console.log("Prediction aborted due to new input");
            } else {
                console.error("AI Prediction error", err);
                setIsPredicting(false);
            }
        }
    };

    useEffect(() => {
        const prevInput = textareaRef.current?.dataset.prevInput || "";
        const prevGhost = textareaRef.current?.dataset.prevGhost || "";
        const prevFullText = prevInput + prevGhost;

        // If a ghost text was being shown, check if the user is just typing it out
        if (prevGhost) {
            // Assuming the user typed more than the previous input, and the total string matches the prediction
            if (value.length > prevInput.length && prevFullText.toLowerCase().startsWith(value.toLowerCase())) {
                const remainingGhost = prevFullText.substring(value.length);
                setGhostText(remainingGhost);
                if (textareaRef.current) {
                    textareaRef.current.dataset.prevInput = value;
                    textareaRef.current.dataset.prevGhost = remainingGhost;
                }
                return; // Keep the remainder of the ghost text, don't clear!
            }
        }

        // Otherwise (trajectory skewed or user backspaced past prediction start), clear ghost text and running predictions
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setGhostText('');
        setIsPredicting(false);
        if (textareaRef.current) {
            textareaRef.current.dataset.prevInput = value;
            textareaRef.current.dataset.prevGhost = '';
        }
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab' || e.key === 'ArrowRight') {
            if (ghostText) {
                e.preventDefault();
                onChange(value + ghostText);
                setGhostText('');
            } else if (e.key === 'Tab' && !isPredicting && value.trim()) {
                e.preventDefault();
                triggerPrediction(value);
            }
        }
    };

    const typographyClass = className || "p-6 text-xl font-medium font-sans leading-[1.8] tracking-[0.015em] min-h-[160px]";

    return (
        <div className="relative w-full flex flex-col group/ghost">
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

            {isFocused && (
                <div className="absolute bottom-6 right-6 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    {isPredicting ? (
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-500/80 bg-indigo-50/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-[0_4px_20px_rgba(99,102,241,0.15)] border border-indigo-100/50">
                            <Sparkles className="w-3.5 h-3.5 animate-spin" /> AI 生成中...
                        </div>
                    ) : ghostText ? (
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-500/80 bg-indigo-50/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-[0_4px_20px_rgba(99,102,241,0.15)] border border-indigo-100/50">
                            按 <kbd className="bg-white border border-indigo-100/80 rounded px-1.5 py-0.5 font-sans shadow-sm text-indigo-600">Tab</kbd> 采纳
                        </div>
                    ) : (
                        value.trim() && (
                            <div className="flex items-center gap-2 text-xs font-bold text-stone-400/80 bg-stone-50/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-stone-200/50 shadow-sm transition-all duration-300 pointer-events-auto cursor-pointer" onClick={() => triggerPrediction(value)}>
                                <Sparkles className="w-3.5 h-3.5" /> 遇到困难？按 <kbd className="bg-white border border-stone-200/80 rounded px-1.5 py-0.5 font-sans shadow-sm text-stone-500">Tab</kbd> 呼出 AI 提示
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
