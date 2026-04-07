"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Grip, MessageCircle, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { AiTeacherConversation, type TutorHistoryTurn } from "./AiTeacherConversation";

const POPUP_EDGE_PADDING = 16;

export interface RebuildTutorPopupState {
    sessionId: string;
    anchorPoint: {
        x: number;
        y: number;
    };
    focusSpan: string;
    teachingPoint: string;
    hasBootstrappedContext: boolean;
    isOpen: boolean;
}

interface RebuildTutorPopupProps {
    popup: RebuildTutorPopupState;
    query: string;
    turns: TutorHistoryTurn[];
    pendingQuestion?: string | null;
    pendingAnswer?: string | null;
    fallbackAnswer?: string | null;
    isAsking: boolean;
    thinkingMode: "chat" | "deep";
    answerMode: "adaptive" | "simple" | "detailed";
    mutedTextClass?: string;
    panelClass: string;
    inputClass: string;
    sendButtonClass: string;
    conversationRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onPlayCardAudio: (text: string) => void;
    onQueryChange: (value: string) => void;
    onThinkingModeChange: (value: "chat" | "deep") => void;
    onAnswerModeChange: (value: "adaptive" | "simple" | "detailed") => void;
    onSubmit: () => void;
}

export function RebuildTutorPopup({
    popup,
    query,
    turns,
    pendingQuestion,
    pendingAnswer,
    fallbackAnswer,
    isAsking,
    thinkingMode,
    answerMode,
    mutedTextClass,
    panelClass,
    inputClass,
    sendButtonClass,
    conversationRef,
    onClose,
    onPlayCardAudio,
    onQueryChange,
    onThinkingModeChange,
    onAnswerModeChange,
    onSubmit,
}: RebuildTutorPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);
    const dragStateRef = useRef<{ startX: number; startY: number; originLeft: number; originBottom: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ left: POPUP_EDGE_PADDING, bottom: POPUP_EDGE_PADDING });
    const positionRef = useRef(position);

    const clampPopupPosition = useCallback((left: number, bottom: number) => {
        if (typeof window === "undefined") return { left, bottom };
        const width = popupRef.current?.offsetWidth ?? 460;
        const height = popupRef.current?.offsetHeight ?? 620;
        const maxLeft = Math.max(POPUP_EDGE_PADDING, window.innerWidth - width - POPUP_EDGE_PADDING);
        const maxBottom = Math.max(POPUP_EDGE_PADDING, window.innerHeight - height - POPUP_EDGE_PADDING);

        return {
            left: Math.min(maxLeft, Math.max(POPUP_EDGE_PADDING, left)),
            bottom: Math.min(maxBottom, Math.max(POPUP_EDGE_PADDING, bottom)),
        };
    }, []);

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        if (typeof window === "undefined" || !popup.isOpen) return;
        
        // Calculate the initial bottom coordinate based on the launcher's top/y anchor
        const height = popupRef.current?.offsetHeight ?? 400;
        const initialTop = popup.anchorPoint.y + 14; 
        const initialBottom = window.innerHeight - initialTop - height;

        const next = clampPopupPosition(popup.anchorPoint.x - 180, initialBottom);
        setPosition(next);
    }, [clampPopupPosition, popup.anchorPoint.x, popup.anchorPoint.y, popup.isOpen, popup.sessionId]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (event: MouseEvent) => {
            const dragState = dragStateRef.current;
            if (!dragState) return;
            // delta Y > 0 means mouse moved down, so bottom should decrease
            const deltaY = event.clientY - dragState.startY;
            setPosition(clampPopupPosition(
                dragState.originLeft + (event.clientX - dragState.startX),
                dragState.originBottom - deltaY,
            ));
        };

        const handleMouseUp = () => {
            dragStateRef.current = null;
            setIsDragging(false);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [clampPopupPosition, isDragging]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const current = positionRef.current;
            setPosition(clampPopupPosition(current.left, current.bottom));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [clampPopupPosition]);

    useEffect(() => {
        if (typeof document === "undefined" || !popup.isOpen) return;

        const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
            if (isDragging) return;
            const popupElement = popupRef.current;
            const target = event.target;
            if (!popupElement || !(target instanceof Node)) return;
            if (popupElement.contains(target)) return;
            onClose();
        };

        document.addEventListener("mousedown", handlePointerDownOutside);
        document.addEventListener("touchstart", handlePointerDownOutside);

        return () => {
            document.removeEventListener("mousedown", handlePointerDownOutside);
            document.removeEventListener("touchstart", handlePointerDownOutside);
        };
    }, [isDragging, onClose, popup.isOpen]);

    const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;

        event.preventDefault();
        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originLeft: position.left,
            originBottom: position.bottom,
        };
        setIsDragging(true);
    };

    if (typeof document === "undefined" || !popup.isOpen) return null;

    return createPortal(
        <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 5 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
                position: "fixed",
                left: position.left,
                bottom: position.bottom,
            }}
            className={cn(
                "z-[9998] flex flex-col w-[min(92vw,400px)] overflow-hidden rounded-[1.4rem] bg-stone-50/90 shadow-[0_24px_60px_rgba(20,40,40,0.15)] ring-1 ring-black/5 backdrop-blur-3xl border border-white/60",
                panelClass,
            )}
        >
            {/* Minimal Header */}
            <div
                onMouseDown={handleDragStart}
                className={cn(
                    "flex items-center justify-between border-b border-black/5 bg-white/50 px-4 py-2.5 select-none shrink-0",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                    <span>讲题老师</span>
                    <span className="opacity-40 font-normal">|</span>
                    <span className="text-[10px] text-stone-400 font-medium">拖拽移动</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1 text-stone-400 hover:bg-stone-200/50 hover:text-stone-700 transition"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Dynamic Conversation Area */}
            {(turns.length > 0 || pendingQuestion || fallbackAnswer) && (
                <div
                    ref={conversationRef}
                    className="max-h-[min(50vh,420px)] flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-stone-200"
                >
                    <AiTeacherConversation
                        turns={turns}
                        pendingQuestion={pendingQuestion}
                        pendingAnswer={pendingQuestion ? pendingAnswer : null}
                        fallbackAnswer={!turns.length ? fallbackAnswer : null}
                        onPlayCardAudio={onPlayCardAudio}
                        variant="compact"
                    />
                </div>
            )}

            {/* Input & Controls Area */}
            <div className={cn(
                "p-3 bg-white",
                !turns.length && !pendingQuestion && !fallbackAnswer && "pt-4"
            )}>
                {/* Compact Mode Controls */}
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-0.5 bg-stone-100 p-0.5 rounded-lg border border-black/5">
                        <button
                            type="button"
                            disabled={isAsking}
                            onClick={() => onThinkingModeChange("chat")}
                            className={cn(
                                "rounded-md px-2.5 py-1 text-[10px] font-bold transition flex items-center gap-1",
                                thinkingMode === "chat"
                                    ? "bg-white text-emerald-600 shadow-sm"
                                    : "text-stone-500 hover:text-stone-700"
                            )}
                        >
                            快答
                        </button>
                        <button
                            type="button"
                            disabled={isAsking}
                            onClick={() => onThinkingModeChange("deep")}
                            className={cn(
                                "rounded-md px-2.5 py-1 text-[10px] font-bold transition flex items-center gap-1",
                                thinkingMode === "deep"
                                    ? "bg-white text-sky-600 shadow-sm"
                                    : "text-stone-500 hover:text-stone-700"
                            )}
                        >
                            <Sparkles className="h-2.5 w-2.5" />
                            深度
                        </button>
                    </div>

                    <div className="flex items-center gap-0.5 bg-stone-100 p-0.5 rounded-lg border border-black/5">
                        {[
                            { value: "simple", label: "简单" },
                            { value: "adaptive", label: "自适应" },
                            { value: "detailed", label: "详细" },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                disabled={isAsking}
                                onClick={() => onAnswerModeChange(option.value as "adaptive" | "simple" | "detailed")}
                                className={cn(
                                    "rounded-md px-2.5 py-1 text-[10px] font-bold transition",
                                    answerMode === option.value
                                        ? "bg-white text-fuchsia-600 shadow-sm"
                                        : "text-stone-500 hover:text-stone-700"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <div className="flex items-center gap-1.5 rounded-xl border border-stone-200/80 bg-stone-50/50 p-1.5 shadow-sm focus-within:border-emerald-300 focus-within:ring-1 focus-within:ring-emerald-300 transition-all">
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder={popup.focusSpan ? `围绕「${popup.focusSpan}」提问...` : "问词意、短语或语法..."}
                            className={cn("h-9 flex-1 bg-transparent px-2.5 text-[13px] font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none", inputClass)}
                        />
                        <button
                            type="submit"
                            disabled={isAsking || !query.trim()}
                            className={cn(
                                "flex h-9 items-center justify-center rounded-[0.65rem] bg-[linear-gradient(135deg,#10b981,#059669)] px-4 text-[13px] font-bold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95",
                                sendButtonClass,
                            )}
                        >
                            {isAsking ? <Sparkles className="h-4 w-4 animate-spin text-emerald-100" /> : "发送"}
                        </button>
                    </div>
                </form>
            </div>
        </motion.div>,
        document.body,
    );
}

interface RebuildTutorLauncherProps {
    onOpen: (anchorPoint: { x: number; y: number }) => void;
}

export function RebuildTutorLauncher({ onOpen }: RebuildTutorLauncherProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const positionRef = useRef({ left: 0, top: 0 });
    const dragStateRef = useRef<{ startX: number; startY: number; originLeft: number; originTop: number } | null>(null);
    const movedRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ left: POPUP_EDGE_PADDING, top: 160 });

    const clampPosition = useCallback((left: number, top: number) => {
        if (typeof window === "undefined") return { left, top };
        const width = buttonRef.current?.offsetWidth ?? 116;
        const height = buttonRef.current?.offsetHeight ?? 46;
        return {
            left: Math.min(window.innerWidth - width - POPUP_EDGE_PADDING, Math.max(POPUP_EDGE_PADDING, left)),
            top: Math.min(window.innerHeight - height - POPUP_EDGE_PADDING, Math.max(POPUP_EDGE_PADDING, top)),
        };
    }, []);

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const next = clampPosition(window.innerWidth - 140, Math.max(150, window.innerHeight * 0.3));
        setPosition((current) => current.left === POPUP_EDGE_PADDING && current.top === 160 ? next : current);
    }, [clampPosition]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (event: MouseEvent) => {
            const dragState = dragStateRef.current;
            if (!dragState) return;
            if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
                movedRef.current = true;
            }
            setPosition(clampPosition(
                dragState.originLeft + (event.clientX - dragState.startX),
                dragState.originTop + (event.clientY - dragState.startY),
            ));
        };

        const handleMouseUp = () => {
            dragStateRef.current = null;
            setIsDragging(false);
            window.setTimeout(() => {
                movedRef.current = false;
            }, 0);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [clampPosition, isDragging]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const current = positionRef.current;
            setPosition(clampPosition(current.left, current.top));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [clampPosition]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            style={{ position: "fixed", left: position.left, top: position.top }}
            className="z-[9997]"
        >
            <button
                ref={buttonRef}
                type="button"
                onMouseDown={(event) => {
                    dragStateRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        originLeft: position.left,
                        originTop: position.top,
                    };
                    movedRef.current = false;
                    setIsDragging(true);
                }}
                onClick={(event) => {
                    if (movedRef.current) {
                        event.preventDefault();
                        return;
                    }
                    const rect = buttonRef.current?.getBoundingClientRect();
                    onOpen({
                        x: rect ? rect.left + rect.width / 2 : position.left,
                        y: rect ? rect.bottom : position.top,
                    });
                }}
                className={cn(
                    "inline-flex h-[46px] items-center justify-center gap-2.5 rounded-full border border-stone-200/80 bg-white/95 px-5 text-[14px] font-bold text-stone-700 shadow-[0_10px_30px_rgba(20,40,40,0.1)] backdrop-blur-xl select-none",
                    "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(20,40,40,0.15)] active:scale-95 active:shadow-[0_4px_16px_rgba(20,40,40,0.1)]",
                    isDragging ? "cursor-grabbing scale-95 shadow-sm" : "cursor-grab",
                )}
            >
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                讲题老师
            </button>
        </motion.div>,
        document.body,
    );
}
