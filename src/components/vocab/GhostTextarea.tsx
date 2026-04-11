import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Brain } from 'lucide-react';
import { getAdaptivePredictionWordCount, getDeterministicPrediction, GhostPrediction } from '@/lib/predictHint';
import { initBGEWorker, subscribeBGEStatus, requestPrefixCompletion, type BGEStatus } from '@/lib/bge-client';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

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

function getCleanText(editor: Editor) {
    let text = "";
    let isFirstParagraph = true;
    
    editor.state.doc.descendants((node) => {
        if (node.type.name === 'paragraph') {
            if (!isFirstParagraph) text += "\n";
            isFirstParagraph = false;
        } else if (node.isText) {
            const isStrike = node.marks?.some(mark => mark.type.name === 'strike');
            if (!isStrike) {
                text += node.text;
            }
        }
    });
    return text.trimStart();
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
    const [replacementMeta, setReplacementMeta] = useState<{ len: number, str: string } | null>(null);
    const [fullReferenceGhost, setFullReferenceGhost] = useState('');
    const [isPredicting, setIsPredicting] = useState(false);
    
    // AI Worker State
    const [aiWorkerStatus, setAiWorkerStatus] = useState<BGEStatus>('idle');
    const [aiWorkerError, setAiWorkerError] = useState<string | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const localCache = useRef<Record<string, GhostPrediction | null>>({});
    const pendingInputRef = useRef<string | null>(null);
    const pendingPromiseRef = useRef<Promise<GhostPrediction | null> | null>(null);
    
    // Dataset replacements
    const prevInputRef = useRef<string>('');
    const prevGhostRef = useRef<string>('');

    const isInternalUpdate = useRef(false);

    const setGhostFromPrediction = (inputValue: string, suggestion: string, predictionResult?: GhostPrediction | null) => {
        setGhostText(suggestion);
        if (predictionResult) {
            setReplacementMeta({ len: predictionResult.replaceLen, str: predictionResult.replaceStr });
        } else {
            setReplacementMeta(null);
        }
        prevInputRef.current = inputValue;
        prevGhostRef.current = suggestion;
    };

    const typographyClass = className || "p-6 text-xl font-medium font-sans leading-[1.8] tracking-[0.015em] min-h-[160px]";

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
            })
        ],
        content: value,
        editable: !disabled,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    "relative z-10 w-full resize-none bg-transparent text-left outline-none whitespace-pre-wrap break-words border-none focus:ring-0 focus:outline-none",
                    "text-stone-900 dark:text-stone-100",
                    "caret-stone-900 dark:caret-white",
                    typographyClass
                ),
                style: "color: #1c1917; -webkit-text-fill-color: #1c1917; opacity: 1;"
            }
        },
        onFocus: () => setIsFocused(true),
        onBlur: () => setIsFocused(false),
        onUpdate: ({ editor }) => {
            if (isInternalUpdate.current) return;
            
            isInternalUpdate.current = true;
            const clean = getCleanText(editor);
            onChange(clean);
            
            const prevInput = prevInputRef.current;
            const prevGhost = prevGhostRef.current;
            const prevFullText = prevInput + prevGhost;
            
            // Advance auto-complete ghost tracking
            if (prevGhost && clean.length > prevInput.length && prevFullText.toLowerCase().startsWith(clean.toLowerCase())) {
                const remainingGhost = prevFullText.substring(clean.length);
                setGhostText(remainingGhost);
                setReplacementMeta(null);
                prevInputRef.current = clean;
                prevGhostRef.current = remainingGhost;
            } else if (clean !== prevInput) {
                if (abortControllerRef.current) abortControllerRef.current.abort();
                setGhostText('');
                setReplacementMeta(null);
                
                // Fallback to local prediction
                const isActivelySpelling = /[a-zA-Z0-9'’]$/.test(clean);
                if (clean.trim() && referenceAnswer && isActivelySpelling) {
                    const effectiveWordCount = getAdaptivePredictionWordCount(clean, predictionWordCount);
                    const deterministicPrediction = getDeterministicPrediction(clean, referenceAnswer, effectiveWordCount);
                    if (deterministicPrediction) {
                        // PRIMARY: Deterministic Character/Word Matcher
                        // Handles standard typing flawlessly, including typos and word boundaries. Only completes current word.
                        setGhostFromPrediction(clean, deterministicPrediction.append, deterministicPrediction);
                        prevInputRef.current = clean; 
                    } else {
                        setGhostText('');
                        setReplacementMeta(null);
                        prevInputRef.current = clean;
                        prevGhostRef.current = '';
                    }
                } else {
                    setGhostText('');
                    setReplacementMeta(null);
                    prevInputRef.current = clean;
                    prevGhostRef.current = '';
                }
            }
            
            setTimeout(() => { isInternalUpdate.current = false; }, 0);
        }
    });

    // Initialize WebGPU AI Worker via Singleton Client
    useEffect(() => {
        initBGEWorker();
        const unsubscribe = subscribeBGEStatus((status, error) => {
            setAiWorkerStatus(status);
            setAiWorkerError(error);
        });
        return unsubscribe;
    }, []);

    // Sync value from parent
    useEffect(() => {
        if (editor && !isInternalUpdate.current) {
            const currentClean = getCleanText(editor);
            if (value !== currentClean) {
                // Determine if we should preserve marks (a reset usually means a whole new text)
                if (value === "") {
                    setReplacementMeta(null);
                    setGhostText("");
                }
                editor.commands.setContent(value);
            }
        }
    }, [value, editor]);

    // Handle initial placeholder natively via CSS
    const showPlaceholder = !value.trim() && !isFocused && !fullReferenceGhost;

    const fetchPrediction = async (currentInputValue: string) => {
        if (!currentInputValue.trim() || disabled || (!sourceText && !referenceAnswer)) {
            return null;
        }

        const effectiveWordCount = getAdaptivePredictionWordCount(currentInputValue, predictionWordCount);
        const inputKey = currentInputValue.trim().toLowerCase().replace(/\s+/g, ' ');
        if (localCache.current[inputKey] !== undefined) {
            return localCache.current[inputKey];
        }

        const deterministicPrediction = getDeterministicPrediction(currentInputValue, referenceAnswer, effectiveWordCount);
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
                if (aiWorkerStatus !== 'ready') return null;
                const rawAppendText = await requestPrefixCompletion(currentInputValue, referenceAnswer);
                if (!rawAppendText) return null;
                
                // BGE Vector Semantic Prediction
                // Allowed to provide up to 3 words for phrasal assistance on Tab
                let appendText = rawAppendText;
                const match = appendText.match(new RegExp(`^(\\s*\\S+){1,3}`)); // Extract up to 3 words
                appendText = match ? match[0] : appendText;
                
                const aiSuggestion: GhostPrediction = {
                    append: appendText,
                    replaceLen: 0,
                    replaceStr: ""
                };

                localCache.current[inputKey] = aiSuggestion;
                return aiSuggestion;
            } catch (err) {
                console.warn("BGE Tab Prediction Error:", err);
                return null;
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
        prevInputRef.current = currentInputValue;
        prevGhostRef.current = '';

        const aiSuggestion = await fetchPrediction(currentInputValue);
        if (editor && getCleanText(editor) === currentInputValue) {
            setGhostFromPrediction(currentInputValue, aiSuggestion?.append || "", aiSuggestion);
            if (aiSuggestion && (aiSuggestion.append || (aiSuggestion.replaceLen ?? 0) > 0)) {
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
        if (forcedGhostVersion === undefined) return;
        const suggestion = forcedGhostText || "";
        setGhostFromPrediction(editor ? getCleanText(editor) : value, suggestion);
        setFullReferenceGhost('');
        setIsPredicting(false);
    }, [forcedGhostVersion, forcedGhostText, editor, value]);

    useEffect(() => {
        if (fullReferenceGhostVersion === undefined) return;
        setFullReferenceGhost(fullReferenceGhostText || "");
        setGhostText('');
        setReplacementMeta(null);
        setIsPredicting(false);
        prevInputRef.current = '';
        prevGhostRef.current = '';
    }, [fullReferenceGhostVersion, fullReferenceGhostText]);

    // Hardware mechanical debounce to prevent aggressive double-firing
    const lastTabTimeRef = useRef<number>(0);

    const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!editor) return;

        // Magical Inline Acceptance (Typing to trace)
        if (replacementMeta && replacementMeta.len > 0 && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const nextExpectedChar = replacementMeta.str[0];
            if (e.key.toLowerCase() === nextExpectedChar.toLowerCase()) {
                e.preventDefault();
                e.stopPropagation();

                const pos = editor.state.selection.from;
                const wrongText = editor.state.doc.textBetween(pos - replacementMeta.len, pos);
                
                const typedChar = replacementMeta.str[0]; // Retain suggested case
                const remainingStr = replacementMeta.str.slice(1);
                
                editor.chain()
                    .deleteRange({ from: pos - replacementMeta.len, to: pos })
                    .insertContent(`<s class="text-rose-400/80 bg-rose-400/10 line-through rounded px-1">${wrongText}</s>`)
                    .insertContent(typedChar)
                    .run();
                
                if (remainingStr === "" && ghostText === "") {
                    setReplacementMeta(null);
                } else {
                    setReplacementMeta({ len: 0, str: remainingStr });
                }
                return;
            }
        }

        if (e.key === 'Tab' || e.key === 'ArrowRight') {
            if (e.repeat) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            const now = Date.now();
            if (e.key === 'Tab' && now - lastTabTimeRef.current < 250) {
                // Ignore mechanical/hardware double-bounces within 250ms
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'Tab') lastTabTimeRef.current = now;

            if (ghostText || replacementMeta) {
                e.preventDefault();
                e.stopPropagation();

                if (replacementMeta && replacementMeta.len > 0) {
                    const pos = editor.state.selection.from;
                    const wrongText = editor.state.doc.textBetween(pos - replacementMeta.len, pos);
                    
                    editor.chain()
                        .deleteRange({ from: pos - replacementMeta.len, to: pos })
                        .insertContent(`<s class="text-rose-400/80 bg-rose-400/10 line-through rounded px-1">${wrongText}</s>`)
                        .insertContent(replacementMeta.str + ghostText)
                        .run();
                } else if (replacementMeta && replacementMeta.len === 0) {
                    // Already slashed, just append the rest
                    editor.commands.insertContent(replacementMeta.str + ghostText);
                } else if (ghostText) {
                    editor.commands.insertContent(ghostText);
                }
                
                setGhostText('');
                setReplacementMeta(null);
                setFullReferenceGhost('');
            } else if (fullReferenceGhost && e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                editor.commands.setContent(fullReferenceGhost);
                setFullReferenceGhost('');
            } else if (e.key === 'Tab' && !isPredicting && value.trim()) {
                e.preventDefault();
                e.stopPropagation();
                void requestPrediction(getCleanText(editor));
            }
        }
    };

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
        <div className="relative w-full flex flex-col group/ghost" ref={containerRef}>
            <div className="relative w-full">
                {showPlaceholder && (
                    <div className={cn("absolute inset-0 z-0 pointer-events-none text-stone-300 dark:text-stone-600", typographyClass)}>
                        {placeholder}
                    </div>
                )}
                
                <div
                    className={cn(
                        "absolute inset-0 z-20 pointer-events-none whitespace-pre-wrap break-words text-left bg-transparent",
                        typographyClass
                    )}
                    aria-hidden="true"
                    style={{ WebkitTextFillColor: "currentColor", color: "inherit" }}
                >
                    {fullReferenceGhost ? (
                        <>
                            <span className="opacity-0 md:inline [&_p]:inline [&_p]:m-0" dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }} />
                            <span className="font-semibold text-amber-500/45 dark:text-amber-300/50 selection:bg-transparent">
                                {fullReferenceDisplay}
                            </span>
                        </>
                    ) : (replacementMeta || ghostText) ? (
                        <>
                            {(replacementMeta && replacementMeta.len > 0) ? (
                                // Pre-TAB exact slicing alignment Hologram
                                <>
                                    <span className="opacity-0">{value.slice(0, Math.max(0, value.length - replacementMeta.len))}</span>
                                    <span className="text-rose-500/30 line-through decoration-rose-500 decoration-2 dark:text-rose-400/30 dark:decoration-rose-400">
                                        {value.slice(-replacementMeta.len)}
                                    </span>
                                </>
                            ) : (
                                // Post-TAB / Tracing Hologram aligns via HTML matching Tiptap
                                <span className="opacity-0 md:inline [&_p]:inline [&_p]:m-0" dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }} />
                            )}
                            
                            {replacementMeta && (replacementMeta.len > 0 || replacementMeta.str) ? (
                                <span className="font-bold text-fuchsia-500 dark:text-fuchsia-400 bg-fuchsia-500/10 dark:bg-fuchsia-400/15 px-1 py-0.5 rounded-md mx-1 shadow-[0_0_12px_rgba(217,70,239,0.3)] saturate-150 inline-flex items-center align-baseline">
                                    <span className="text-fuchsia-400/70 dark:text-fuchsia-300/50 mr-1 select-none font-medium scale-90">➔</span>
                                    {replacementMeta.str}
                                </span>
                            ) : null}
                            
                            {ghostText && (
                                <span className="font-semibold text-indigo-500/32 dark:text-indigo-400/42 selection:bg-transparent">
                                    {ghostText}
                                </span>
                            )}
                        </>
                    ) : null}
                </div>

                <div onKeyDownCapture={handleKeyDownCapture} className="relative z-10 w-full outline-none focus:outline-none">
                    <EditorContent editor={editor} />
                </div>
            </div>

            {isFocused && (
                <div className="absolute bottom-4 right-4 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    {isPredicting ? (
                        <div className="flex items-center gap-2 rounded-full border border-indigo-100/80 bg-white/90 px-3 py-1.5 text-[11px] font-bold text-indigo-600 shadow-[0_8px_18px_rgba(99,102,241,0.12)] backdrop-blur-md">
                            <Sparkles className="w-3.5 h-3.5 animate-spin" /> AI 生成中...
                        </div>
                    ) : (ghostText || replacementMeta || fullReferenceGhost) ? (
                        isHintGhostActive ? (
                            <div className="flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-bold text-amber-700 shadow-[0_8px_18px_rgba(245,158,11,0.16)] backdrop-blur-md">
                                Hint 参考已显示，按 <kbd className="bg-amber-50 border border-amber-200/80 rounded-md px-1.5 py-0.5 font-sans shadow-sm text-amber-700">Tab</kbd> 采纳
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 rounded-full border border-indigo-100/80 bg-white/92 px-3 py-1.5 text-[11px] font-bold text-indigo-600 shadow-[0_8px_18px_rgba(99,102,241,0.12)] backdrop-blur-md">
                                按 <kbd className="bg-indigo-50 border border-indigo-100/80 rounded-md px-1.5 py-0.5 font-sans shadow-sm text-indigo-700">Tab</kbd> 或接着打字采纳
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
            
            {(aiWorkerStatus !== 'idle') && (
                <div className="absolute top-2 right-2 flex items-center justify-end pointer-events-none opacity-60">
                    <div className={cn(
                        "flex items-center gap-1.5 rounded-full backdrop-blur-md px-2 py-1 text-[10px] font-semibold",
                        aiWorkerStatus === 'error' ? "bg-rose-100/50 text-rose-500" : "bg-stone-100/50 text-stone-500"
                    )}>
                        {aiWorkerStatus === 'loading' ? (
                            <><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> 雷达上线中 (加载 BGE...)</>
                        ) : aiWorkerStatus === 'ready' ? (
                            <><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> BGE 语义雷达锁定</>
                        ) : (
                            <span className="max-w-[200px] truncate" title={aiWorkerError || "Unknown Error"}>
                                <span className="text-rose-500 font-bold mr-1">⚠️ BGE 阵亡:</span> 
                                {aiWorkerError || "雷达初始化失败"}
                            </span>
                        )}
                    </div>
                </div>
            )}
            
            {/* Global prose overrides for Tiptap specific styling */}
            <style dangerouslySetInnerHTML={{__html: `
                .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: transparent;
                    pointer-events: none;
                    height: 0;
                }
            `}} />
        </div>
    );
}
