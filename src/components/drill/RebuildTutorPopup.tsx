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
    mutedTextClass?: string;
    panelClass: string;
    inputClass: string;
    sendButtonClass: string;
    conversationRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onPlayCardAudio: (text: string) => void;
    onQueryChange: (value: string) => void;
    onThinkingModeChange: (value: "chat" | "deep") => void;
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
    mutedTextClass,
    panelClass,
    inputClass,
    sendButtonClass,
    conversationRef,
    onClose,
    onPlayCardAudio,
    onQueryChange,
    onThinkingModeChange,
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
                "z-[9998] flex flex-col w-[min(92vw,400px)] overflow-hidden rounded-[1.6rem] bg-stone-50/70 shadow-[0_32px_80px_rgba(20,40,40,0.18)] ring-1 ring-black/5 backdrop-blur-3xl border border-white/60",
                panelClass,
            )}
        >
            <div
                onMouseDown={handleDragStart}
                className={cn(
                    "border-b border-white/50 bg-white/40 px-5 py-4 select-none shrink-0",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[15px] font-semibold text-stone-800">
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            英语老师
                            <span className="inline-flex items-center gap-1 rounded-full border border-black/5 bg-white/60 px-2 py-0.5 text-[10px] font-medium text-stone-500 shadow-sm backdrop-blur-md">
                                <Grip className="h-3 w-3" />
                                可拖动
                            </span>
                        </div>
                        <p className={cn("mt-1.5 text-xs leading-5", mutedTextClass || "text-stone-500")}>
                            {popup.focusSpan ? `围绕「${popup.focusSpan}」直接提问。` : "直接问这个句子的词义、短语或语法。"}
                        </p>
                        <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-black/5 bg-white/55 p-1 shadow-sm backdrop-blur-md">
                            <button
                                type="button"
                                disabled={isAsking}
                                onClick={() => onThinkingModeChange("chat")}
                                className={cn(
                                    "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                                    thinkingMode === "chat"
                                        ? "bg-emerald-500 text-white shadow-sm"
                                        : "text-stone-500 hover:bg-white/70 hover:text-stone-800",
                                    isAsking && "cursor-default opacity-60"
                                )}
                            >
                                快答
                            </button>
                            <button
                                type="button"
                                disabled={isAsking}
                                onClick={() => onThinkingModeChange("deep")}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition",
                                    thinkingMode === "deep"
                                        ? "bg-sky-500 text-white shadow-sm"
                                        : "text-stone-500 hover:bg-white/70 hover:text-stone-800",
                                    isAsking && "cursor-default opacity-60"
                                )}
                            >
                                <Sparkles className="h-3 w-3" />
                                深度思考
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-black/5 bg-white/60 p-2 text-stone-500 shadow-sm backdrop-blur-md transition hover:bg-white hover:text-stone-700 hover:scale-105 active:scale-95"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="px-5 py-4 flex-1 overflow-hidden flex flex-col">
                <div className="flex flex-1 flex-col overflow-hidden rounded-[1.45rem] border border-pink-100/80 bg-[linear-gradient(180deg,rgba(255,249,252,0.98),rgba(255,246,250,0.94))] shadow-[0_18px_44px_rgba(244,114,182,0.09)] ring-1 ring-white/75">
                    <div
                        ref={conversationRef}
                        className="max-h-[min(52vh,460px)] flex-1 overflow-y-auto px-4 pt-4 pr-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-pink-200 hover:scrollbar-thumb-pink-300"
                    >
                        {turns.length || pendingQuestion || fallbackAnswer ? (
                            <AiTeacherConversation
                                turns={turns}
                                pendingQuestion={pendingQuestion}
                                pendingAnswer={pendingQuestion ? pendingAnswer : null}
                                fallbackAnswer={!turns.length ? fallbackAnswer : null}
                                onPlayCardAudio={onPlayCardAudio}
                                variant="compact"
                            />
                        ) : (
                            <div className="rounded-2xl border border-pink-100/80 bg-white/70 px-5 py-4 text-[14px] leading-6 text-stone-600 shadow-sm">
                                <div className="flex items-center gap-2 text-[12px] font-semibold text-fuchsia-700 uppercase tracking-wider">
                                    <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
                                    AI 即问即答
                                </div>
                                <p className="mt-2.5">第一次提问会聪明地带上本题上下文，后面你可以直接追问细节。</p>
                            </div>
                        )}
                    </div>

                    <form
                        className="px-3 pb-3 pt-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            onSubmit();
                        }}
                    >
                        <div className="flex items-center gap-2 rounded-[1.25rem] border border-pink-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,248,252,0.96))] p-1.5 shadow-[0_10px_24px_rgba(244,114,182,0.06)] ring-1 ring-white/80">
                            <input
                                type="text"
                                value={query}
                                onChange={(event) => onQueryChange(event.target.value)}
                                placeholder={popup.focusSpan ? `围绕「${popup.focusSpan}」提问...` : "问这个词、短语或语法点..."}
                                className={cn("h-11 flex-1 rounded-xl bg-transparent px-3 text-[15px] font-medium text-stone-800 placeholder:text-rose-300 focus:outline-none", inputClass)}
                            />
                            <button
                                type="submit"
                                disabled={isAsking || !query.trim()}
                                className={cn(
                                    "inline-flex h-10 min-w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-[0.9rem] bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(236,72,153,0.24)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none active:scale-95",
                                    sendButtonClass,
                                )}
                            >
                                {isAsking ? <Sparkles className="h-4 w-4 animate-spin text-pink-50" /> : <MessageCircle className="h-4 w-4" />}
                                {isAsking ? "思考中" : "提问"}
                            </button>
                        </div>
                    </form>
                </div>
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
                    "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,252,0.92))] px-4 text-sm font-semibold text-stone-700 shadow-[0_16px_40px_rgba(15,23,42,0.14)] backdrop-blur-[20px] select-none",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                英语老师
            </button>
        </motion.div>,
        document.body,
    );
}
