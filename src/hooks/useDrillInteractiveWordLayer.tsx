"use client";

import { useCallback, useRef, useState, type MutableRefObject, type ReactNode, type MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { getBattleInteractiveWordClassName } from "@/lib/drill-interactive-word";

import type { PopupState } from "@/components/reading/WordPopup";
import type { CachedDrillAudio } from "@/hooks/useDrillAudioPlayback";

interface UseDrillInteractiveWordLayerParams {
    audioRef: MutableRefObject<HTMLAudioElement | null>;
    currentAudioTime: number;
    drillReferenceEnglish?: string;
    getCachedAudio: (text: string) => CachedDrillAudio | undefined;
    isDictationMode: boolean;
    isListeningFamilyMode: boolean;
    isListeningMode: boolean;
    isPlaying: boolean;
    isRebuildMode: boolean;
}

export function useDrillInteractiveWordLayer({
    audioRef,
    currentAudioTime,
    drillReferenceEnglish,
    getCachedAudio,
    isDictationMode,
    isListeningFamilyMode,
    isListeningMode,
    isPlaying,
    isRebuildMode,
}: UseDrillInteractiveWordLayerParams) {
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);
    const lastWordPopupTriggerRef = useRef<{ at: number; text: string }>({ at: 0, text: "" });

    const normalizeWordPopupText = useCallback((text: string) => (
        text
            .replace(/[‘’]/g, "'")
            .replace(/[^a-zA-Z\s'-]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    ), []);

    const extractSelectionPopupText = useCallback((selection: Selection | null) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";

        const range = selection.getRangeAt(0);
        const directText = normalizeWordPopupText(selection.toString());
        if (directText.includes(" ")) {
            return directText.slice(0, 80);
        }

        const anchorElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer as Element
            : range.commonAncestorContainer.parentElement;
        const root = anchorElement?.closest("[data-word-popup-root='true']");
        if (!root) {
            return directText.slice(0, 80);
        }

        const selectedSegments = Array.from(root.querySelectorAll<HTMLElement>("[data-word-popup-segment]"))
            .filter((node) => {
                try {
                    return range.intersectsNode(node);
                } catch {
                    return false;
                }
            })
            .map((node) => node.dataset.wordPopupSegment?.trim() ?? "")
            .filter(Boolean);

        if (selectedSegments.length < 2) {
            return directText.slice(0, 80);
        }

        return normalizeWordPopupText(selectedSegments.join(" ")).slice(0, 80);
    }, [normalizeWordPopupText]);

    const getCurrentSelectionFocusSpan = useCallback(() => {
        if (typeof window === "undefined") return "";
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return "";

        return extractSelectionPopupText(selection);
    }, [extractSelectionPopupText]);

    const openWordPopupAtPosition = useCallback((text: string, x: number, y: number, contextText?: string) => {
        const normalizedText = normalizeWordPopupText(text);
        const alphaLength = normalizedText.replace(/[\s'-]/g, "").length;
        if (!normalizedText || alphaLength < 2) return false;

        const lookupKey = normalizedText.toLowerCase();
        const now = Date.now();
        const lastTrigger = lastWordPopupTriggerRef.current;
        if (lastTrigger.text === lookupKey && now - lastTrigger.at < 450) {
            return true;
        }
        lastWordPopupTriggerRef.current = { text: lookupKey, at: now };

        const sourceKind: PopupState["sourceKind"] = isRebuildMode
            ? "rebuild"
            : isListeningMode
                ? "listening"
                : isDictationMode
                    ? "dictation"
                    : "translation";
        const sourceLabel = isRebuildMode
            ? "来自 Rebuild"
            : isListeningMode
                ? "来自 Listening"
                : isDictationMode
                    ? "来自 Dictation"
                    : "来自 Translation";

        setWordPopup({
            word: normalizedText,
            context: contextText || drillReferenceEnglish || "",
            x,
            y,
            sourceKind,
            sourceLabel,
            sourceSentence: drillReferenceEnglish || contextText || "",
            sourceNote: "",
        });
        return true;
    }, [drillReferenceEnglish, isDictationMode, isListeningMode, isRebuildMode, normalizeWordPopupText]);

    const openWordPopupAtElement = useCallback((element: HTMLElement, word: string, contextText?: string) => {
        const rect = element.getBoundingClientRect();
        return openWordPopupAtPosition(
            word,
            rect.left + rect.width / 2,
            rect.bottom + 10,
            contextText,
        );
    }, [openWordPopupAtPosition]);

    const openWordPopupFromSelection = useCallback((selection: Selection | null, contextText?: string) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;

        return openWordPopupAtPosition(
            extractSelectionPopupText(selection),
            rect.left + rect.width / 2,
            rect.bottom + 10,
            contextText || selection.anchorNode?.textContent || drillReferenceEnglish || "",
        );
    }, [drillReferenceEnglish, extractSelectionPopupText, openWordPopupAtPosition]);

    const handleInteractiveTextMouseUp = useCallback((contextText?: string) => {
        if (typeof window === "undefined") return;
        openWordPopupFromSelection(window.getSelection(), contextText);
    }, [openWordPopupFromSelection]);

    const handleWordClick = useCallback((event: MouseEvent, word: string, contextText?: string) => {
        event.stopPropagation();
        if (typeof window !== "undefined" && openWordPopupFromSelection(window.getSelection(), contextText)) {
            return;
        }

        const cleanWord = normalizeWordPopupText(word).replace(/\s+/g, " ").trim();
        if (!cleanWord) return;

        if (isListeningFamilyMode && drillReferenceEnglish) {
            const cached = getCachedAudio(drillReferenceEnglish);

            if (cached?.marks && audioRef.current) {
                const targetMark = cached.marks.find((mark) => {
                    const normalizedMark = mark.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                    return normalizedMark === cleanWord.toLowerCase();
                });
                if (targetMark && isPlaying) {
                    audioRef.current.currentTime = targetMark.time / 1000;
                }
            }
        }

        openWordPopupAtElement(event.currentTarget as HTMLElement, word, contextText);
    }, [
        audioRef,
        drillReferenceEnglish,
        getCachedAudio,
        isListeningFamilyMode,
        isPlaying,
        normalizeWordPopupText,
        openWordPopupAtElement,
        openWordPopupFromSelection,
    ]);

    const renderInteractiveText = useCallback((text: string): ReactNode => {
        if (!text) return null;

        const cached = drillReferenceEnglish ? getCachedAudio(drillReferenceEnglish) : undefined;
        const marks = cached?.marks || [];

        return (
            <span data-word-popup-root="true">
                {text.split(" ").map((word, index) => {
                    const clean = word.replace(/[^a-zA-Z]/g, "").trim();
                    const isActive = wordPopup?.word === clean;
                    const mark = marks[index];
                    const isKaraokeActive = isPlaying && !isActive && mark && (() => {
                        const normalizedMark = mark.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                        const wordMatch = normalizedMark === clean.toLowerCase();
                        const timeMatch = currentAudioTime >= mark.start && currentAudioTime <= (mark.end + 200);
                        return wordMatch && timeMatch;
                    })();

                    return (
                        <span key={index} className="relative inline-block">
                            <span
                                data-word-popup-segment={word}
                                onClick={(event) => handleWordClick(event, word, text)}
                                onMouseUp={() => handleInteractiveTextMouseUp(text)}
                                className={cn(
                                    "cursor-pointer px-1.5 py-0.5 transition-all duration-300 rounded-lg mx-[1px] relative",
                                    "hover:text-rose-600 hover:bg-rose-50/60 hover:scale-105",
                                    getBattleInteractiveWordClassName({
                                        isActive,
                                        isKaraokeActive,
                                    }),
                                )}
                            >
                                {word}
                            </span>{" "}
                        </span>
                    );
                })}
            </span>
        );
    }, [
        currentAudioTime,
        drillReferenceEnglish,
        getCachedAudio,
        handleInteractiveTextMouseUp,
        handleWordClick,
        isPlaying,
        wordPopup?.word,
    ]);

    const renderInteractiveCoachText = useCallback((text: string): ReactNode => {
        if (!text) return null;

        return (
            <span data-word-popup-root="true">
                {text.split(" ").map((word, index) => {
                    const clean = word.replace(/[^a-zA-Z]/g, "").trim();
                    const isActive = clean && wordPopup?.word?.toLowerCase() === clean.toLowerCase();

                    return (
                        <span key={`${word}-${index}`} className="inline-block">
                            <span
                                data-word-popup-segment={word}
                                onClick={(event) => handleWordClick(event, word, text)}
                                onMouseUp={() => handleInteractiveTextMouseUp(text)}
                                className={cn(
                                    "cursor-pointer rounded-lg px-1 py-0.5 transition-all duration-200",
                                    "hover:bg-stone-100/80 hover:text-stone-900",
                                    isActive ? "bg-stone-100 text-stone-900 ring-1 ring-stone-200" : "text-stone-800",
                                )}
                            >
                                {word}
                            </span>{" "}
                        </span>
                    );
                })}
            </span>
        );
    }, [handleInteractiveTextMouseUp, handleWordClick, wordPopup?.word]);

    return {
        getCurrentSelectionFocusSpan,
        handleInteractiveTextMouseUp,
        handleWordClick,
        renderInteractiveCoachText,
        renderInteractiveText,
        setWordPopup,
        wordPopup,
    };
}
