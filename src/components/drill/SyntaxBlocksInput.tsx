"use client";

import React, { useRef, useState, useEffect, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useGhostSettingsStore } from "@/lib/ghost-settings-store";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { playPopSound, playSuccessSound, playErrorSound, shootMiniConfetti, shootBlockSuccess } from "@/lib/feedback-engine";

interface SyntaxChunk {
    role: string;
    english: string;
    chinese?: string;
    keywords?: string[];
}

interface SyntaxBlocksInputProps {
    chunks: SyntaxChunk[];
    chineseContext?: string;
    value: string;
    onChange: (value: string) => void;
    onActiveIndexChange?: (index: number | null, value?: string) => void;
    disabled?: boolean;
    keywords?: string[];
}

interface Verdict {
    isValid: boolean;
    isOverride: boolean; // True if validated by AI, false if matched target perfectly
    message?: string;
}

export function SyntaxBlocksInput({ chunks, chineseContext = "", onChange, onActiveIndexChange, disabled, keywords = [] }: SyntaxBlocksInputProps) {
    const [blockValues, setBlockValues] = useState<string[]>(Array(chunks.length).fill(""));
    const [localFocusedIndex, setLocalFocusedIndex] = useState<number | null>(null);
    const [bonusDepth, setBonusDepth] = useState(0);
    const [comboCount, setComboCount] = useState(0);
    
    // AI Verification states
    const [verifyingSet, setVerifyingSet] = useState<Set<number>>(new Set());
    const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
    
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    
    const { 
        nlpWaterfallDepth, 
        activeRescueWordCount, 
        algorithmMode,
        passiveRescueEnabled,
        passiveRescueTimeoutSeconds,
        passiveRescueWordCount
    } = useGhostSettingsStore();
    
    const basePredictionWordCount = algorithmMode === 'nlp' ? nlpWaterfallDepth : activeRescueWordCount;
    const predictionWordCount = basePredictionWordCount + bonusDepth;

    useEffect(() => {
        onChange(blockValues.filter(v => v.trim().length > 0).join(" "));
        setBonusDepth(0);
        
        if (!passiveRescueEnabled || passiveRescueWordCount <= 0 || passiveRescueTimeoutSeconds <= 0) return;

        const timeoutId = setTimeout(() => {
            setBonusDepth(passiveRescueWordCount); // Trigger once per stall, no infinite accumulation
        }, passiveRescueTimeoutSeconds * 1000);

        return () => clearTimeout(timeoutId);
    }, [blockValues, passiveRescueEnabled, passiveRescueTimeoutSeconds, passiveRescueWordCount, onChange]);

    const getGhostText = (val: string, target: string, depth: number, isFocused: boolean) => {
        if (!target.toLowerCase().startsWith(val.toLowerCase()) || val.length >= target.length) {
            return "";
        }
        
        // Show ghost text for empty input ONLY when focused
        if (val.length === 0 && !isFocused) {
            return "";
        }

        const remainder = target.slice(val.length);
        let ghostText = "";
        let remainderAfterCurrent = remainder;

        if (val.length > 0 && !val.endsWith(' ') && !remainder.startsWith(' ')) {
            const match = remainder.match(/^([^\s]+)/);
            if (match) {
                ghostText += match[1];
                remainderAfterCurrent = remainder.slice(match[1].length);
            }
        }

        if (depth > 0) {
            const regex = new RegExp(`^(\\s*\\S+){0,${depth}}`);
            const match = remainderAfterCurrent.match(regex);
            if (match && match[0]) {
                ghostText += match[0];
            }
        }

        return ghostText;
    };

    const verifySynonym = async (index: number, val: string) => {
        const target = chunks[index].english;
        const rect = inputRefs.current[index]?.getBoundingClientRect();
        
        // Perfect match
        if (val.trim().toLowerCase() === target.trim().toLowerCase()) {
            setVerdicts(prev => ({ ...prev, [index]: { isValid: true, isOverride: false } }));
            playSuccessSound();
            shootBlockSuccess(rect);
            return;
        }

        // Empty
        if (!val.trim()) {
             setVerdicts(prev => {
                const copy = { ...prev };
                delete copy[index];
                return copy;
            });
            return;
        }

        // Trigger AI Override Check
        setVerifyingSet(prev => new Set(prev).add(index));
        try {
            const res = await fetch("/api/ai/verify_synonym", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chinese_context: chineseContext,
                    chunk_role: chunks[index].role,
                    chunk_chinese: chunks[index].chinese,
                    target_english: target,
                    user_input: val.trim()
                })
            });
            const data = await res.json();
            
            setVerdicts(prev => ({ 
                ...prev, 
                [index]: { 
                    isValid: data.isValid, 
                    isOverride: data.isValid, 
                    message: data.correction 
                } 
            }));

            if (data.isValid) {
                playSuccessSound();
                shootBlockSuccess(rect);
            } else {
                setComboCount(0);
                playErrorSound();
            }
            
        } catch (e) {
            console.error(e);
            setVerdicts(prev => ({ ...prev, [index]: { isValid: false, isOverride: false, message: "Network Error" } }));
            setComboCount(0);
            playErrorSound();
        } finally {
            setVerifyingSet(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
        const val = blockValues[index] || "";
        const target = chunks[index].english;
        const effectiveDepth = val.length === 0 ? bonusDepth : predictionWordCount;
        const ghostText = getGhostText(val, target, effectiveDepth, true);
        const rect = inputRefs.current[index]?.getBoundingClientRect();

        if (e.key === "Tab" || e.key === "Enter") {
            if (e.key === "Tab") {
                 e.preventDefault();
                 if (ghostText) {
                     setComboCount(c => {
                         const next = c + 1;
                         playPopSound(next);
                         shootMiniConfetti(rect, next);
                         return next;
                     });

                     updateBlock(index, val + ghostText);
                     if (val + ghostText === target) {
                         setVerdicts(prev => ({ ...prev, [index]: { isValid: true, isOverride: false } }));
                         playSuccessSound();
                         shootBlockSuccess(rect);
                         if (index < chunks.length - 1) {
                             setTimeout(() => { inputRefs.current[index + 1]?.focus(); }, 10);
                         }
                     }
                     return;
                 }
            }
            
            e.preventDefault();
            // On Enter (or Tab if no ghost text), we perform verification and move focus.
            if (val.trim() !== target.trim() && val.trim().length > 0) {
                // If it's not a perfect match, verify it.
                verifySynonym(index, val);
            } else if (val.trim() === target.trim()) {
                setVerdicts(prev => ({ ...prev, [index]: { isValid: true, isOverride: false } }));
                playSuccessSound();
                shootBlockSuccess(rect);
            }

            if (index < chunks.length - 1) {
                inputRefs.current[index + 1]?.focus();
            }
        } else if (e.key === "Backspace" && !val && index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleBlur = (index: number) => {
        const val = blockValues[index] || "";
        const target = chunks[index].english;
        if (val.trim() === target.trim()) {
             setVerdicts(prev => ({ ...prev, [index]: { isValid: true, isOverride: false } }));
        }
    };

    const updateBlock = (index: number, val: string) => {
        const oldVal = blockValues[index] || "";
        const target = chunks[index].english;
        const rect = inputRefs.current[index]?.getBoundingClientRect();

        // Auto-fill trailing punctuation if only punctuation remains
        let finalVal = val;
        if (val.length > 0 && target.toLowerCase().startsWith(val.toLowerCase())) {
            const remainder = target.slice(val.length);
            if (remainder.length > 0 && /^[\s.,!?;:'"()\-]+$/.test(remainder)) {
                finalVal = target;
            }
        }

        // Combo Logic and Feedback
        const isCurrentlyCorrect = target.toLowerCase().startsWith(finalVal.toLowerCase());
        
        if (finalVal.length < oldVal.length) {
            // Typing backspace
            setComboCount(0);
        } else if (!isCurrentlyCorrect) {
            // Typed a wrong character
            setComboCount(0);
            // Optionally play a subtle error click here if desired, but might be too noisy
        } else if (finalVal.length > oldVal.length && isCurrentlyCorrect) {
            // Typed a correct character!
            const targetNextChar = target.charAt(finalVal.length);
            const isWordCompletedJustNow = (targetNextChar === ' ' || targetNextChar === '.' || targetNextChar === ',' || targetNextChar === '') && !finalVal.endsWith(' ');

            setComboCount(c => {
                const next = c + 1;
                // Play a mechanical pop that pitches up with combo!
                playPopSound(next);
                
                // Shoot fireworks the exact millisecond the word is completed (don't wait for space)
                if (isWordCompletedJustNow) {
                    shootMiniConfetti(rect, next);
                }
                
                return next;
            });
        }

        const newVals = [...blockValues];
        newVals[index] = finalVal;
        setBlockValues(newVals);
        
        // Auto-verify on complete match!
        if (finalVal.length > 0 && finalVal.toLowerCase() === target.toLowerCase()) {
            setVerdicts(prev => ({ ...prev, [index]: { isValid: true, isOverride: false } }));
            playSuccessSound();
            shootBlockSuccess(rect);
            // Auto focus next block after a tiny delay for visual satisfaction
            if (index < chunks.length - 1) {
                setTimeout(() => { inputRefs.current[index + 1]?.focus(); }, 150);
            }
        } else {
            // Clear verdict completely while typing if they are modifying
            if (verdicts[index]) {
                setVerdicts(prev => {
                    const next = { ...prev };
                    delete next[index];
                    return next;
                });
            }
        }
    };

    return (
        <LayoutGroup>
            <motion.div layout className="flex flex-wrap items-center gap-4 w-full py-5 px-1 md:px-2">
                <AnimatePresence>
                    {chunks.map((chunk, index) => {
                        const val = blockValues[index] || "";
                        const target = chunk.english;
                        const effectiveDepth = val.length === 0 ? bonusDepth : predictionWordCount;
                        const ghostText = getGhostText(val, target, effectiveDepth, index === localFocusedIndex);
                        
                        const isVerifying = verifyingSet.has(index);
                        const verdict = verdicts[index];
                        const showBaseError = val.length > 0 && !verdict && !isVerifying && val.toLowerCase() !== target.toLowerCase() && !target.toLowerCase().startsWith(val.trim().toLowerCase());
                        
                        const isError = verdict ? !verdict.isValid : showBaseError;
                        const isPerfectSuccess = verdict ? (verdict.isValid && !verdict.isOverride) : (val.toLowerCase() === target.toLowerCase());
                        const isOverrideSuccess = verdict?.isValid && verdict?.isOverride;

                        return (
                            <motion.div 
                                layout
                                key={index} 
                                animate={
                                    isVerifying ? { opacity: 0.8, scale: 0.98 } 
                                    : (isError && verdict) ? { x: [-2, 2, -2, 2, 0] } // Shake on rejected override
                                    : { scale: 1, opacity: 1, x: 0 }
                                }
                                transition={
                                    (isError && verdict) 
                                        ? { default: { type: "spring" as const, stiffness: 300, damping: 24 }, x: { type: "tween" as const, duration: 0.4 } }
                                        : { type: "spring" as const, stiffness: 300, damping: 24 }
                                }
                                className={cn(
                                    "relative flex flex-col pt-1.5 pb-1 mt-2 shrink-0 transition-all duration-300 group cursor-text focus-within:z-[60]"
                                )} 
                                onClick={() => inputRefs.current[index]?.focus()}
                            >
                                
                                {/* AI Message Tooltip for Failure */}
                                <AnimatePresence>
                                    {verdict && !verdict.isValid && verdict.message && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -5, scale: 0.8 }}
                                            className="absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1 bg-red-600 text-white text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl z-20 pointer-events-none"
                                        >
                                            {verdict.message}
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-600 w-0 h-0" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Keywords (Top Tier) */}
                                {(() => {
                                    const chunkKeywords = chunk.keywords && Array.isArray(chunk.keywords) && chunk.keywords.length > 0 
                                        ? chunk.keywords 
                                        : keywords.filter(kw => 
                                            target.toLowerCase().includes(kw.toLowerCase()) || 
                                            kw.toLowerCase().split(/\s+/).some(word => word.length > 3 && target.toLowerCase().includes(word))
                                        );
                                    
                                    if (isOverrideSuccess) return <div className="h-4 mb-1.5 shrink-0" />;

                                    return (
                                        <div className="flex items-center gap-2 h-4 mb-1.5 shrink-0 pointer-events-none select-none">
                                            {chunkKeywords.length > 0 ? chunkKeywords.map((kw, idx) => (
                                                <span key={idx} className={cn(
                                                    "text-[10.5px] font-medium tracking-wide transition-colors leading-none",
                                                    isError ? "text-red-400"
                                                    : isPerfectSuccess ? "text-emerald-500/80"
                                                    : "text-indigo-400/90 group-focus-within:text-indigo-500"
                                                )}>
                                                    {kw}
                                                </span>
                                            )) : (
                                                // Invisible placeholder to keep vertical alignment consistent across blocks
                                                <span className="text-[10.5px] leading-none invisible">_</span>
                                            )}
                                        </div>
                                    );
                                })()}
                                
                                {/* Micro-headers (Role + Chinese Context) */}
                                <motion.div layout="position" className="flex items-end flex-wrap gap-1.5 mb-0.5 pointer-events-none select-none">
                                    <span className={cn(
                                        "text-[9px] font-extrabold tracking-widest uppercase px-1 rounded-sm bg-stone-100/50 transition-colors shrink-0",
                                        isError ? "text-red-500 bg-red-100" 
                                        : (isPerfectSuccess || isOverrideSuccess) ? "text-emerald-600 bg-emerald-100" 
                                        : "text-stone-400 group-focus-within:bg-indigo-100 group-focus-within:text-indigo-500"
                                    )}>
                                        {isOverrideSuccess ? "👑 自定义" : chunk.role}
                                    </span>
                                    {chunk.chinese && !isOverrideSuccess && (
                                        <span className={cn(
                                            "text-[11px] font-medium leading-none tracking-[0.02em] pb-[1px] whitespace-nowrap shrink-0", 
                                            isError ? "text-red-600/80" 
                                            : (isPerfectSuccess) ? "text-emerald-600/70" 
                                            : "text-stone-400 group-focus-within:text-indigo-400/80"
                                        )} title={chunk.chinese}>
                                            {chunk.chinese}
                                        </span>
                                    )}
                                </motion.div>
                                
                                {/* Right Side / Bottom: Input Target */}
                                <motion.div 
                                    layout="position" 
                                    className={cn(
                                        "relative flex justify-start items-center min-w-[30px] h-[26px] border-b-[1.5px] transition-colors rounded-t-sm w-fit",
                                        "border-stone-200/50 group-hover:border-indigo-300 group-focus-within:!border-indigo-500 group-focus-within:bg-indigo-50/20",
                                        (val.length === 0 && !isVerifying && !isError) && "border-dashed group-focus-within:border-solid",
                                        isVerifying && "border-amber-300 bg-amber-50/30",
                                        isError && "border-red-400 bg-red-50/20",
                                        (isPerfectSuccess || isOverrideSuccess) && "border-emerald-400 bg-emerald-50/20"
                                    )}
                                >
                                    
                                    {/* Verifying Spinner */}
                                    <AnimatePresence>
                                        {isVerifying && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                className="absolute -right-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin z-20"
                                            />
                                        )}
                                    </AnimatePresence>

                                    {/* Hidden sizer */}
                                    <span className="invisible whitespace-pre text-[15.5px] font-medium font-sans [font-kerning:none] tracking-[0.01em] inline-block h-5 overflow-hidden px-0.5 pointer-events-none">
                                        {val.length > target.length ? val : target}
                                    </span>

                                    {/* Ghost Text */}
                                    {!verdict && !isVerifying && (
                                        <div className="absolute inset-y-0 left-0 w-full flex items-center px-0.5 pointer-events-none whitespace-pre text-[15.5px] font-medium font-sans [font-kerning:none] tracking-[0.01em] select-none">
                                            <span className="opacity-0">{val}</span>
                                            <AnimatePresence>
                                                {ghostText && (
                                                    <motion.span
                                                        initial={{ opacity: 0, filter: 'blur(5px)', x: 3 }}
                                                        animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                                                        exit={{ opacity: 0, filter: 'blur(3px)', x: -2 }}
                                                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
                                                        className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-indigo-300/80 to-purple-300/50 font-semibold drop-shadow-sm inline-flex items-center"
                                                    >
                                                        {ghostText}
                                                        <motion.span 
                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ delay: 0.1, duration: 0.2 }}
                                                            className="inline-block ml-1.5"
                                                        >
                                                            <kbd className="bg-white/40 border border-indigo-200/50 rounded border-b-[2px] px-1 py-[1.5px] text-[8px] leading-none font-bold text-indigo-400 tracking-tighter uppercase shadow-sm backdrop-blur-sm">Tab</kbd>
                                                        </motion.span>
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}

                                    {/* Animated Typed Text (Visible) */}
                                    {!verdict && (
                                        <div className="absolute inset-y-0 left-0 w-full flex items-center px-0.5 pointer-events-none whitespace-pre text-[15.5px] font-medium font-sans [font-kerning:none] tracking-[0.01em] select-none">
                                            <AnimatePresence>
                                                {val.split("").map((char, charIndex) => (
                                                    <motion.span
                                                        key={charIndex}
                                                        initial={{ opacity: 0, scale: 0.7, y: 1, filter: 'blur(2px)' }}
                                                        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                                                        exit={{ opacity: 0, scale: 0.8, filter: 'blur(1px)' }}
                                                        transition={{ duration: 0.1, ease: "easeOut" }}
                                                        className={cn(
                                                            isVerifying ? "text-amber-600/70" : isError ? "text-red-500" : (isPerfectSuccess || isOverrideSuccess) ? "text-emerald-700" : "text-stone-800",
                                                            (isPerfectSuccess || isOverrideSuccess) && "font-semibold"
                                                        )}
                                                    >
                                                        {char}
                                                    </motion.span>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                    {/* Finished/Verdict static text (no character animation to save perf) */}
                                    {verdict && (
                                        <div className={cn(
                                            "absolute inset-y-0 left-0 w-full flex items-center px-0.5 pointer-events-none whitespace-pre text-[15.5px] font-medium font-sans [font-kerning:none] tracking-[0.01em] select-none",
                                            isVerifying ? "text-amber-600/70" : isError ? "text-red-500" : (isPerfectSuccess || isOverrideSuccess) ? "text-emerald-700 font-semibold" : "text-stone-800"
                                        )}>
                                            {val}
                                        </div>
                                    )}

                                    {/* Actual Input */}
                                    <input
                                        ref={(el: HTMLInputElement | null) => { inputRefs.current[index] = el; }}
                                        type="email"  // Using "email" type forces the OS/Browser to use an English/Latin keyboard and suppresses the IME popup
                                        lang="en"
                                        spellCheck={false}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        disabled={disabled || isVerifying}
                                        value={val}
                                        onFocus={() => {
                                            setLocalFocusedIndex(index);
                                            onActiveIndexChange?.(index, blockValues[index]);
                                        }}
                                        onBlur={() => {
                                            handleBlur(index);
                                            setLocalFocusedIndex(null);
                                            // Delay clearing active index slightly so clicking buttons doesn't immediately hide focus
                                            setTimeout(() => onActiveIndexChange?.(null), 100);
                                        }}
                                        onChange={(e) => {
                                            if (e.target.value.includes("  ")) {
                                                e.target.value = e.target.value.replace(/  +/g, " ");
                                            }
                                            updateBlock(index, e.target.value);
                                            onActiveIndexChange?.(index, e.target.value);
                                        }}
                                        onKeyDown={(e) => handleKeyDown(e, index)}
                                        className={cn(
                                            "absolute inset-y-0 w-full left-0 px-0.5 bg-transparent outline-none border-none p-0 m-0",
                                            "text-[15.5px] font-medium tracking-[0.01em] caret-indigo-500 font-sans [font-kerning:none] transition-colors duration-500",
                                            "text-transparent selection:bg-indigo-300/40"
                                        )}
                                        style={{ boxShadow: 'none' }}
                                    />
                                    
                                    {/* AI Validation Button */}
                                    <AnimatePresence>
                                        {!isPerfectSuccess && !isOverrideSuccess && !isVerifying && val.length > 0 && showBaseError && (
                                            <motion.button
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                onMouseDown={(e) => {
                                                    // Prevent input blur
                                                    e.preventDefault();
                                                    verifySynonym(index, val);
                                                }}
                                                className="absolute -right-8 top-1/2 -translate-y-1/2 flex items-center justify-center p-1.5 rounded-md hover:bg-amber-100 text-amber-500 transition-colors z-20 group/btn"
                                                title="请 AI 验证我的同义改写"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover/btn:animate-pulse">
                                                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                                                    <path d="M5 3v4"/>
                                                    <path d="M19 17v4"/>
                                                    <path d="M3 5h4"/>
                                                    <path d="M17 19h4"/>
                                                </svg>
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                                
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>
        </LayoutGroup>
    );
}
