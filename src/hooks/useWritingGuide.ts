import { useEffect, useState, useRef, useCallback } from "react";
import { useGhostSettingsStore } from "@/lib/ghost-settings-store";
import {
    shouldEscalateWritingGuide,
    type WritingGuideHistoryItem,
    type WritingGuideState,
} from "@/lib/writing-guide";

export interface WritingGuideStep {
    state: WritingGuideState;
    label: string;
    hint: string;
    hasError?: boolean;
    grammarPoint?: string;
    grammarExplain?: string;
    focus?: string;
    nextAction?: string;
}

export function useWritingGuide({
    chinese,
    userText,
    referenceText,
    activeChunk,
    activeChunkIndex,
    activeChunkInput,
    disabled = false
}: {
    chinese?: string;
    userText: string;
    referenceText: string;
    activeChunk?: { role: string; english: string; chinese?: string };
    activeChunkIndex?: number | null;
    activeChunkInput?: string;
    disabled?: boolean;
}) {
    const { writingGuideEnabled } = useGhostSettingsStore();
    
    const [activeGuideStep, setActiveGuideStep] = useState<WritingGuideStep | null>(null);
    const [isGuideVisible, setIsGuideVisible] = useState(false);
    const [isCoachMode, setIsCoachMode] = useState(false);
    const [struggleLevel, setStruggleLevel] = useState(0);
    const [history, setHistory] = useState<WritingGuideHistoryItem[]>([]);
    
    const abortRef = useRef<AbortController | null>(null);
    const escalationTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Reset history when shifting to a new drill
    useEffect(() => {
        setHistory([]);
    }, [chinese, referenceText]);

    // Reset visibility state whenever user types or jumps to a different chunk!
    useEffect(() => {
        setIsGuideVisible(false);
        setStruggleLevel(0);
        setIsCoachMode(false);
        
        if (abortRef.current) {
            abortRef.current.abort();
            // Do NOT set null here, we still need the ref object for future aborts
        }
        if (escalationTimerRef.current) {
            clearTimeout(escalationTimerRef.current);
            escalationTimerRef.current = null;
        }
    }, [userText, activeChunkIndex]);

    const activeHintKey = activeGuideStep?.hint || "";

    const triggerFetch = useCallback(async (currentStruggle: number, manualCoachMode: boolean = false) => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
        abortRef.current = new AbortController();
        
        try {
            const res = await fetch("/api/ai/writing_guide", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chinese,
                    referenceEnglish: referenceText,
                    currentInput: userText,
                    activeChunk,
                    activeChunkInput,
                    struggleLevel: currentStruggle,
                    previousHint: activeHintKey,
                    history,
                    intent: manualCoachMode ? "coach" : "hint"
                }),
                signal: abortRef.current.signal
            });
            
            if (!res.ok) throw new Error("Fetch failed");
            const data = await res.json();
            
            if (data && data.label && data.hint && data.state) {
                setActiveGuideStep({
                    state: data.state,
                    label: data.label,
                    hint: data.hint,
                    hasError: data.hasError,
                    grammarPoint: data.grammarPoint,
                    grammarExplain: data.grammarExplain,
                    focus: data.focus,
                    nextAction: data.nextAction,
                });
                
                setHistory(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.hint === data.hint && last.state === data.state) return prev;
                    return [...prev.slice(-2), {
                        input: userText,
                        state: data.state,
                        label: data.label,
                        hint: data.hint,
                        focus: data.focus,
                        nextAction: data.nextAction,
                    }];
                });

                setIsGuideVisible(true);

                // If it's visible, the user has still not typed, and struggle level < 2, schedule an escalation
                if (currentStruggle < 2 && shouldEscalateWritingGuide(data.state)) {
                    escalationTimerRef.current = setTimeout(() => {
                        setStruggleLevel(prev => prev + 1);
                    }, 10000);
                }
            }
        } catch (err: any) {
            if (err.name !== "AbortError") {
                console.warn("Failed to fetch writing guide:", err);
            }
        }
    }, [chinese, referenceText, userText, activeChunk, activeChunkInput, activeHintKey, history]);

    useEffect(() => {
        if (!writingGuideEnabled || disabled || !chinese || !referenceText) {
            setIsGuideVisible(false);
            return;
        }

        // IMPORTANT: If we are already showing a guide for the current text, DON'T FETCH AGAIN!
        if (isGuideVisible) return;

        // If struggleLevel changes > 0, we fetch immediately.
        if (struggleLevel > 0) {
            triggerFetch(struggleLevel, isCoachMode);
            return;
        }

        // If struggleLevel is 0, user just stopped typing. Wait 3s.
        const initialTimer = setTimeout(() => {
            triggerFetch(0, false);
        }, 3000);

        return () => {
            clearTimeout(initialTimer);
            if (abortRef.current) {
                // We only abort if user starts typing, which happens in the other useEffect!
                // Wait, if dependencies change (like writingGuideEnabled), we abort.
                abortRef.current.abort();
            }
            if (escalationTimerRef.current) {
                clearTimeout(escalationTimerRef.current);
            }
        };
    }, [userText, referenceText, chinese, writingGuideEnabled, disabled, struggleLevel, isCoachMode, isGuideVisible, triggerFetch]);

    const triggerManualHint = useCallback(() => {
        setIsGuideVisible(false);
        setIsCoachMode(true);
        setStruggleLevel((prev) => prev > 0 ? prev : 1);
    }, []);

    return {
        activeGuideStep,
        isGuideVisible,
        isCoachMode,
        setIsGuideVisible,
        struggleLevel,
        grammarPoint: activeGuideStep?.grammarPoint || "",
        grammarExplain: activeGuideStep?.grammarExplain || "",
        triggerManualHint
    };
}
