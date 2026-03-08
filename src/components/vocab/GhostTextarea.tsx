import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { getAdaptivePredictionWordCount, getExactPrefixPrediction } from '@/lib/predictHint';

interface GhostTextareaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    sourceText?: string;
    referenceAnswer?: string;
    predictionWordCount?: number;
    className?: string;
    onPredictionRequest?: () => boolean;
    onPredictionShown?: () => void;
    predictionCostText?: string;
    forcedGhostText?: string;
    forcedGhostVersion?: number;
    fullReferenceGhostText?: string;
    fullReferenceGhostVersion?: number;
}

export function GhostTextarea({
    value,
    onChange,
    placeholder = "Type here...",
    disabled = false,
    sourceText,
    referenceAnswer,
    predictionWordCount = 2,
    className,
    onPredictionRequest,
    onPredictionShown,
    predictionCostText = "消耗 1 胶囊获取提示",
    forcedGhostText,
    forcedGhostVersion,
    fullReferenceGhostText,
    fullReferenceGhostVersion,
}: GhostTextareaProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [ghostText, setGhostText] = useState('');
    const [fullReferenceGhost, setFullReferenceGhost] = useState('');
    const [isPredicting, setIsPredicting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const localCache = useRef<Record<string, string>>({});
    const pendingInputRef = useRef<string | null>(null);
    const pendingPromiseRef = useRef<Promise<string> | null>(null);
    const latestValueRef = useRef(value);

    const setGhostFromPrediction = (inputValue: string, suggestion: string) => {
        setGhostText(suggestion);
        if (textareaRef.current) {
            textareaRef.current.dataset.prevInput = inputValue;
            textareaRef.current.dataset.prevGhost = suggestion;
        }
    };

    const fetchPrediction = async (currentInputValue: string) => {
        if (!currentInputValue.trim() || disabled || (!sourceText && !referenceAnswer)) {
            return "";
        }

        const effectiveWordCount = getAdaptivePredictionWordCount(currentInputValue, predictionWordCount);
        const inputKey = currentInputValue.trim().toLowerCase().replace(/\s+/g, ' ');
        if (localCache.current[inputKey] !== undefined) {
            return localCache.current[inputKey];
        }

        const deterministicPrediction = getExactPrefixPrediction(currentInputValue, referenceAnswer, effectiveWordCount);
        if (deterministicPrediction) {
            localCache.current[inputKey] = deterministicPrediction;
            return deterministicPrediction;
        }

        if (pendingInputRef.current === inputKey && pendingPromiseRef.current) {
            return pendingPromiseRef.current;
        }

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const request = (async () => {
            try {
                const res = await fetch('/api/ai/predict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceText,
                        currentInput: currentInputValue,
                        referenceAnswer,
                        predictionWordCount: effectiveWordCount,
                    }),
                    signal: abortControllerRef.current?.signal
                });

                if (!res.ok) {
                    return "";
                }

                const data = await res.json();
                let aiSuggestion = data.prediction || "";

                if (aiSuggestion) {
                    const match = aiSuggestion.match(new RegExp(`^(\\s*\\S+){1,${effectiveWordCount}}`));
                    aiSuggestion = match ? match[0] : aiSuggestion;
                }

                localCache.current[inputKey] = aiSuggestion;
                return aiSuggestion;
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') {
                    console.log("Prediction aborted due to new input");
                    return "";
                }
                console.error("AI Prediction error", err);
                return "";
            } finally {
                if (pendingInputRef.current === inputKey) {
                    pendingInputRef.current = null;
                    pendingPromiseRef.current = null;
                }
            }
        })();

        pendingInputRef.current = inputKey;
        pendingPromiseRef.current = request;
        return request;
    };

    const triggerPrediction = async (currentInputValue: string) => {
        if (!currentInputValue.trim() || disabled || (!sourceText && !referenceAnswer)) {
            setGhostText('');
            setIsPredicting(false);
            return;
        }

        setGhostText('');
        setIsPredicting(true);
        if (textareaRef.current) {
            textareaRef.current.dataset.prevInput = currentInputValue;
            textareaRef.current.dataset.prevGhost = '';
        }

        const aiSuggestion = await fetchPrediction(currentInputValue);
        if (textareaRef.current?.value === currentInputValue) {
            setGhostFromPrediction(currentInputValue, aiSuggestion);
            if (aiSuggestion) {
                onPredictionShown?.();
            }
        }
        setIsPredicting(false);
    };

    const requestPrediction = async (currentInputValue: string) => {
        if (onPredictionRequest && !onPredictionRequest()) {
            return;
        }

        await triggerPrediction(currentInputValue);
    };

    useEffect(() => {
        latestValueRef.current = value;
    }, [value]);

    useEffect(() => {
        if (forcedGhostVersion === undefined) return;
        const suggestion = forcedGhostText || "";
        setGhostFromPrediction(textareaRef.current?.value || latestValueRef.current, suggestion);
        setFullReferenceGhost('');
        setIsPredicting(false);
    }, [forcedGhostVersion, forcedGhostText]);

    useEffect(() => {
        if (fullReferenceGhostVersion === undefined) return;
        setFullReferenceGhost(fullReferenceGhostText || "");
        setGhostText('');
        setIsPredicting(false);
        if (textareaRef.current) {
            textareaRef.current.dataset.prevInput = '';
            textareaRef.current.dataset.prevGhost = '';
        }
    }, [fullReferenceGhostVersion, fullReferenceGhostText]);

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
                const nextValue = value + ghostText;
                onChange(nextValue);
                setGhostText('');
                setFullReferenceGhost('');
            } else if (fullReferenceGhost && e.key === 'Tab') {
                e.preventDefault();
                onChange(fullReferenceGhost);
                setFullReferenceGhost('');
            } else if (e.key === 'Tab' && !isPredicting && value.trim()) {
                e.preventDefault();
                void requestPrediction(value);
            }
        }
    };

    const typographyClass = className || "p-6 text-xl font-medium font-sans leading-[1.8] tracking-[0.015em] min-h-[160px]";
    const normalizedValue = value.trimStart().toLowerCase();
    const normalizedReference = fullReferenceGhost.trimStart().toLowerCase();
    const fullRefStartsWithValue = Boolean(
        fullReferenceGhost &&
        normalizedValue &&
        normalizedReference.startsWith(normalizedValue)
    );
    const fullReferenceDisplay = fullReferenceGhost
        ? (fullRefStartsWithValue
            ? fullReferenceGhost.slice(value.trimStart().length)
            : (value.trim() ? `\n${fullReferenceGhost}` : fullReferenceGhost))
        : "";
    const isHintGhostActive = Boolean(fullReferenceGhost);

    return (
        <div className="relative w-full flex flex-col group/ghost">
            <div className="relative w-full">
                <div
                    className={cn(
                        "absolute inset-0 z-0 pointer-events-none whitespace-pre-wrap break-words text-left bg-transparent",
                        typographyClass
                    )}
                    aria-hidden="true"
                >
                    {fullReferenceGhost ? (
                        <>
                            <span className="opacity-0">{value}</span>
                            <span className="font-semibold text-amber-500/45 dark:text-amber-300/50 selection:bg-transparent">
                                {fullReferenceDisplay}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="opacity-0">{value}</span>
                            {ghostText && (
                                <span className="font-semibold text-indigo-500/32 dark:text-indigo-400/42 selection:bg-transparent">
                                    {ghostText}
                                </span>
                            )}
                        </>
                    )}
                </div>

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={fullReferenceGhost ? "" : placeholder}
                    disabled={disabled}
                    className={cn(
                        "relative z-10 w-full resize-none bg-transparent text-left outline-none opacity-100 mix-blend-normal transition-colors duration-200 antialiased caret-stone-900 selection:bg-indigo-100 selection:text-stone-900",
                        "text-stone-900 dark:text-stone-100 [-webkit-text-fill-color:theme(colors.stone.900)] dark:[-webkit-text-fill-color:theme(colors.stone.100)]",
                        "placeholder:text-stone-300/95 dark:placeholder:text-white/25 placeholder:font-medium",
                        typographyClass
                    )}
                    style={{
                        color: "#1c1917",
                        WebkitTextFillColor: "#1c1917",
                        opacity: 1,
                    }}
                    spellCheck={false}
                />
            </div>

            {isFocused && (
                <div className="absolute bottom-4 right-4 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    {isPredicting ? (
                        <div className="flex items-center gap-2 rounded-full border border-indigo-100/80 bg-white/90 px-3 py-1.5 text-[11px] font-bold text-indigo-600 shadow-[0_8px_18px_rgba(99,102,241,0.12)] backdrop-blur-md">
                            <Sparkles className="w-3.5 h-3.5 animate-spin" /> AI 生成中...
                        </div>
                    ) : (ghostText || fullReferenceGhost) ? (
                        isHintGhostActive ? (
                            <div className="flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-bold text-amber-700 shadow-[0_8px_18px_rgba(245,158,11,0.16)] backdrop-blur-md">
                                Hint 参考已显示，按 <kbd className="bg-amber-50 border border-amber-200/80 rounded-md px-1.5 py-0.5 font-sans shadow-sm text-amber-700">Tab</kbd> 采纳
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 rounded-full border border-indigo-100/80 bg-white/92 px-3 py-1.5 text-[11px] font-bold text-indigo-600 shadow-[0_8px_18px_rgba(99,102,241,0.12)] backdrop-blur-md">
                                按 <kbd className="bg-indigo-50 border border-indigo-100/80 rounded-md px-1.5 py-0.5 font-sans shadow-sm text-indigo-700">Tab</kbd> 采纳
                            </div>
                        )
                    ) : (
                        value.trim() && (
                            <div className="flex items-center gap-2 rounded-full border border-stone-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-bold text-stone-500 shadow-[0_8px_16px_rgba(15,23,42,0.06)] transition-all duration-300 pointer-events-auto cursor-pointer" onClick={() => void requestPrediction(value)}>
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> 按 <kbd className="bg-stone-50 border border-stone-200/80 rounded-md px-1.5 py-0.5 font-sans shadow-sm text-stone-600">Tab</kbd> {predictionCostText}
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
