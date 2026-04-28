"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
    TutorHistoryTurn,
    TutorStructuredResponse,
} from "@/components/drill/AiTeacherConversation";
import type { RebuildTutorPopupState } from "@/components/drill/RebuildTutorPopup";

export type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";
export type TutorIntent = "translate" | "grammar" | "lexical" | "rebuild";
export type TutorUiSurface = "battle" | "score" | "rebuild_floating_teacher";
export type TutorThinkingMode = "chat" | "deep";
export type TutorAnswerMode = "adaptive" | "simple" | "detailed";
export type RebuildTutorSessionState = RebuildTutorPopupState;

interface UseDrillTutorLayerParams {
    canOpenScoreTutor: boolean;
    clearWordPopup: () => void;
    getCurrentSelectionFocusSpan: () => string;
    hasRebuildMeta: boolean;
    hasScoreFeedback: boolean;
    isRebuildMode: boolean;
    resolveTeachingPoint: () => string;
}

export function useDrillTutorLayer({
    canOpenScoreTutor,
    clearWordPopup,
    getCurrentSelectionFocusSpan,
    hasRebuildMeta,
    hasScoreFeedback,
    isRebuildMode,
    resolveTeachingPoint,
}: UseDrillTutorLayerParams) {
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [tutorThread, setTutorThread] = useState<TutorHistoryTurn[]>([]);
    const [tutorResponse, setTutorResponse] = useState<TutorStructuredResponse | null>(null);
    const [tutorPendingQuestion, setTutorPendingQuestion] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);
    const [tutorRecentMastery, setTutorRecentMastery] = useState<string[]>([]);
    const [tutorThinkingMode, setTutorThinkingMode] = useState<TutorThinkingMode>("chat");
    const [tutorAnswerMode, setTutorAnswerMode] = useState<TutorAnswerMode>("adaptive");
    const tutorConversationRef = useRef<HTMLDivElement | null>(null);
    const [rebuildTutorSession, setRebuildTutorSession] = useState<RebuildTutorSessionState | null>(null);
    const [scoreTutorSession, setScoreTutorSession] = useState<RebuildTutorSessionState | null>(null);

    const isRebuildTutorSurface = isRebuildMode && hasRebuildMeta;
    const isRebuildFloatingTutorSurface = isRebuildMode && Boolean(rebuildTutorSession?.isOpen);
    const isScoreTutorPopupSurface = !isRebuildMode && Boolean(scoreTutorSession?.isOpen);
    const activeTutorTeachingPoint = tutorResponse?.teaching_point || resolveTeachingPoint();

    const inferTutorIntent = useCallback((questionType: TutorQuestionType, teachingPoint: string): TutorIntent => {
        if (isRebuildMode) return "rebuild";
        if (questionType === "word_choice" || /词汇|搭配/.test(teachingPoint)) return "lexical";
        if (/语序|从句|时态|语法/.test(teachingPoint)) return "grammar";
        return "translate";
    }, [isRebuildMode]);

    const inferFocusSpan = useCallback((question: string) => {
        const quoted = question.match(/[“"](.*?)[”"]/)?.[1]?.trim();
        if (quoted) return quoted.slice(0, 40);
        const englishWord = question.match(/[A-Za-z][A-Za-z'-]{2,}/)?.[0]?.trim();
        if (englishWord) return englishWord;
        const chinesePhrase = question.match(/[\u4e00-\u9fa5]{2,}/)?.[0]?.trim();
        return chinesePhrase ? chinesePhrase.slice(0, 16) : "";
    }, []);

    const normalizeTutorResponse = useCallback((raw: unknown, fallbackTeachingPoint: string): TutorStructuredResponse => {
        const readString = (value: unknown) => typeof value === "string" ? value.trim() : "";
        const asObject = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const rawTags = Array.isArray(asObject.error_tags) ? asObject.error_tags : [];
        const errorTags = rawTags
            .map((item) => readString(item).toLowerCase())
            .filter(Boolean)
            .slice(0, 4);
        const rawQualityFlags = Array.isArray(asObject.quality_flags) ? asObject.quality_flags : [];
        const qualityFlags = rawQualityFlags
            .map((item) => readString(item))
            .filter(Boolean)
            .slice(0, 6);
        const rawExamples = Array.isArray(asObject.example_sentences) ? asObject.example_sentences : [];
        const example_sentences: NonNullable<TutorStructuredResponse["example_sentences"]> = [];
        for (const item of rawExamples) {
            const example = item && typeof item === "object" ? item as Record<string, unknown> : {};
            const sentence_en = readString(example.sentence_en);
            if (!sentence_en) continue;
            const rawTokens = Array.isArray(example.sentence_en_tokens) ? example.sentence_en_tokens : [];
            example_sentences.push({
                label_cn: readString(example.label_cn) || undefined,
                sentence_en,
                sentence_en_tokens: rawTokens.map((token) => readString(token)).filter(Boolean),
                note_cn: readString(example.note_cn) || undefined,
            });
            if (example_sentences.length >= 3) break;
        }

        return {
            coach_markdown:
                readString(asObject.coach_markdown) ||
                readString(asObject.coach_cn) ||
                "1. **先保主干意思**。\n2. 这次只补一个关键表达点。\n3. 先把这一点说顺，再决定要不要看整句。",
            response_intent: readString(asObject.response_intent) as TutorStructuredResponse["response_intent"],
            answer_revealed: Boolean(asObject.answer_revealed),
            full_answer: readString(asObject.full_answer) || undefined,
            answer_reason_cn: readString(asObject.answer_reason_cn) || undefined,
            example_sentences: example_sentences.length > 0 ? example_sentences : undefined,
            teaching_point: readString(asObject.teaching_point) || fallbackTeachingPoint,
            error_tags: errorTags,
            quality_flags: qualityFlags,
        };
    }, []);

    const openTutorModal = useCallback(() => {
        setIsTutorOpen(true);
    }, []);

    useEffect(() => {
        if (!isTutorOpen && !rebuildTutorSession?.isOpen) return;

        const frame = window.requestAnimationFrame(() => {
            const container = tutorConversationRef.current;
            if (!container) return;
            container.scrollTo({
                top: container.scrollHeight,
                behavior: tutorThread.length > 0 ? "smooth" : "auto",
            });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [isTutorOpen, rebuildTutorSession?.isOpen, tutorPendingQuestion, tutorThread.length]);

    const closeRebuildTutorPopup = useCallback(() => {
        setRebuildTutorSession((current) => current ? { ...current, isOpen: false } : current);
    }, []);

    const openRebuildTutorPopup = useCallback((event?: React.MouseEvent<HTMLElement> | { x: number; y: number }, explicitFocusSpan?: string) => {
        if (!isRebuildMode || !hasRebuildMeta) return;

        const focusSpan = explicitFocusSpan || getCurrentSelectionFocusSpan() || rebuildTutorSession?.focusSpan || "";
        const anchorX = event && "clientX" in event
            ? event.clientX
            : event?.x ?? rebuildTutorSession?.anchorPoint.x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 320);
        const anchorY = event && "clientY" in event
            ? event.clientY
            : event?.y ?? rebuildTutorSession?.anchorPoint.y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 240);

        clearWordPopup();
        setIsTutorOpen(false);
        setRebuildTutorSession((current) => ({
            sessionId: current?.sessionId ?? `${Date.now()}`,
            anchorPoint: { x: anchorX, y: anchorY },
            focusSpan,
            teachingPoint: current?.teachingPoint || activeTutorTeachingPoint,
            hasBootstrappedContext: current?.hasBootstrappedContext ?? false,
            isOpen: true,
        }));
    }, [
        activeTutorTeachingPoint,
        clearWordPopup,
        getCurrentSelectionFocusSpan,
        hasRebuildMeta,
        isRebuildMode,
        rebuildTutorSession?.anchorPoint.x,
        rebuildTutorSession?.anchorPoint.y,
        rebuildTutorSession?.focusSpan,
    ]);

    const closeScoreTutorPopup = useCallback(() => {
        setScoreTutorSession((current) => current ? { ...current, isOpen: false } : current);
    }, []);

    const openScoreTutorPopup = useCallback((event?: React.MouseEvent<HTMLElement> | { x: number; y: number }, explicitFocusSpan?: string) => {
        if (isRebuildMode || !hasScoreFeedback || !canOpenScoreTutor) return;

        const focusSpan = explicitFocusSpan || getCurrentSelectionFocusSpan() || scoreTutorSession?.focusSpan || "";
        const anchorX = event && "clientX" in event
            ? event.clientX
            : event?.x ?? scoreTutorSession?.anchorPoint.x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 320);
        const anchorY = event && "clientY" in event
            ? event.clientY
            : event?.y ?? scoreTutorSession?.anchorPoint.y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 240);

        clearWordPopup();
        setIsTutorOpen(false);
        setRebuildTutorSession(null);
        setScoreTutorSession((current) => ({
            sessionId: current?.sessionId ?? `${Date.now()}`,
            anchorPoint: { x: anchorX, y: anchorY },
            focusSpan,
            teachingPoint: current?.teachingPoint || activeTutorTeachingPoint,
            hasBootstrappedContext: current?.hasBootstrappedContext ?? false,
            isOpen: true,
        }));
    }, [
        activeTutorTeachingPoint,
        canOpenScoreTutor,
        clearWordPopup,
        getCurrentSelectionFocusSpan,
        hasScoreFeedback,
        isRebuildMode,
        scoreTutorSession?.anchorPoint.x,
        scoreTutorSession?.anchorPoint.y,
        scoreTutorSession?.focusSpan,
    ]);

    const rememberTutorMastery = useCallback((response: TutorStructuredResponse, focusSpan: string) => {
        const additions: string[] = [];

        if (focusSpan.trim()) additions.push(focusSpan.trim());
        if (response.teaching_point.trim()) additions.push(response.teaching_point.trim());

        setTutorRecentMastery((prev) => {
            const seen = new Set<string>();
            const merged = [...prev, ...additions]
                .map((item) => item.trim())
                .filter((item) => item && item.length <= 24)
                .filter((item) => {
                    if (seen.has(item)) return false;
                    seen.add(item);
                    return true;
                });

            return merged.slice(-8);
        });
    }, []);

    return {
        activeTutorTeachingPoint,
        closeRebuildTutorPopup,
        closeScoreTutorPopup,
        inferFocusSpan,
        inferTutorIntent,
        isAskingTutor,
        isRebuildFloatingTutorSurface,
        isRebuildTutorSurface,
        isScoreTutorPopupSurface,
        isTutorOpen,
        normalizeTutorResponse,
        openRebuildTutorPopup,
        openScoreTutorPopup,
        openTutorModal,
        rebuildTutorSession,
        rememberTutorMastery,
        scoreTutorSession,
        setIsAskingTutor,
        setIsTutorOpen,
        setRebuildTutorSession,
        setScoreTutorSession,
        setTutorAnswer,
        setTutorAnswerMode,
        setTutorPendingQuestion,
        setTutorQuery,
        setTutorRecentMastery,
        setTutorResponse,
        setTutorThinkingMode,
        setTutorThread,
        tutorAnswer,
        tutorAnswerMode,
        tutorConversationRef,
        tutorPendingQuestion,
        tutorQuery,
        tutorRecentMastery,
        tutorResponse,
        tutorThinkingMode,
        tutorThread,
    };
}
