"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type {
    TutorHistoryTurn,
    TutorStructuredResponse,
} from "@/components/drill/AiTeacherConversation";
import type {
    RebuildTutorSessionState,
    TutorAnswerMode,
    TutorIntent,
    TutorQuestionType,
    TutorThinkingMode,
    TutorUiSurface,
} from "@/hooks/useDrillTutorLayer";
import { requestRagQuery } from "@/lib/bge-client";

interface LootDropState {
    amount: number;
    message: string;
    rarity: "common" | "rare" | "legendary";
    type: "exp" | "gem" | "theme";
}

interface TutorDrillData {
    chinese: string;
    reference_english: string;
    _topicMeta?: {
        topic: string;
    };
}

interface TutorDrillFeedback {
    improved_version?: string;
    score?: number;
}

interface TutorRebuildFeedback {
    evaluation: {
        accuracyRatio?: number;
        userSentence?: string;
    };
}

interface TutorContext {
    articleTitle?: string;
    topic?: string;
}

interface RebuildAnswerToken {
    text: string;
}

export interface AskTutorOptions {
    forceReveal?: boolean;
    question?: string;
    questionType?: TutorQuestionType;
}

export function useDrillTutorRequest({
    activeTutorTeachingPoint,
    applyEconomyPatch,
    coinsRef,
    context,
    drillData,
    drillFeedback,
    effectivePersona,
    getCurrentSelectionFocusSpan,
    inferFocusSpan,
    inferTutorIntent,
    isRebuildFloatingTutorSurface,
    isRebuildTutorSurface,
    isScoreTutorPopupSurface,
    normalizeTutorResponse,
    rebuildAnswerTokens,
    rebuildFeedback,
    rebuildTutorSession,
    rememberTutorMastery,
    setIsAskingTutor,
    setLootDrop,
    setRebuildTutorSession,
    setTutorAnswer,
    setTutorPendingQuestion,
    setTutorQuery,
    setTutorResponse,
    setTutorThread,
    tutorAnswerMode,
    tutorQuery,
    tutorRecentMastery,
    tutorThinkingMode,
    tutorThread,
    userTranslation,
}: {
    activeTutorTeachingPoint: string;
    applyEconomyPatch: (patch: any) => unknown;
    coinsRef: MutableRefObject<number>;
    context: TutorContext;
    drillData: TutorDrillData | null;
    drillFeedback: TutorDrillFeedback | null;
    effectivePersona: string;
    getCurrentSelectionFocusSpan: () => string;
    inferFocusSpan: (question: string) => string;
    inferTutorIntent: (questionType: TutorQuestionType, teachingPoint: string) => TutorIntent;
    isRebuildFloatingTutorSurface: boolean;
    isRebuildTutorSurface: boolean;
    isScoreTutorPopupSurface: boolean;
    normalizeTutorResponse: (raw: unknown, fallbackTeachingPoint: string) => TutorStructuredResponse;
    rebuildAnswerTokens: RebuildAnswerToken[];
    rebuildFeedback: TutorRebuildFeedback | null;
    rebuildTutorSession: RebuildTutorSessionState | null;
    rememberTutorMastery: (response: TutorStructuredResponse, focusSpan: string) => void;
    setIsAskingTutor: Dispatch<SetStateAction<boolean>>;
    setLootDrop: Dispatch<SetStateAction<LootDropState | null>>;
    setRebuildTutorSession: Dispatch<SetStateAction<RebuildTutorSessionState | null>>;
    setTutorAnswer: Dispatch<SetStateAction<string | null>>;
    setTutorPendingQuestion: Dispatch<SetStateAction<string | null>>;
    setTutorQuery: Dispatch<SetStateAction<string>>;
    setTutorResponse: Dispatch<SetStateAction<TutorStructuredResponse | null>>;
    setTutorThread: Dispatch<SetStateAction<TutorHistoryTurn[]>>;
    tutorAnswerMode: TutorAnswerMode;
    tutorQuery: string;
    tutorRecentMastery: string[];
    tutorThinkingMode: TutorThinkingMode;
    tutorThread: TutorHistoryTurn[];
    userTranslation: string;
}) {
    const handleAskTutor = useCallback(async (options?: AskTutorOptions) => {
        const question = (options?.question ?? tutorQuery).trim();
        if (!question || !drillData) return;

        const assistantLabel = (isRebuildFloatingTutorSurface || isScoreTutorPopupSurface)
            ? "英语老师"
            : isRebuildTutorSurface
                ? "英语问答"
                : "AI Teacher";
        const shouldChargeTutorCoins = !(isRebuildFloatingTutorSurface || isScoreTutorPopupSurface);
        if (shouldChargeTutorCoins && coinsRef.current < 10) {
            setTutorAnswer(`${assistantLabel} 每次提问会消耗 10 星光币。你当前星光币不够了。`);
            setTutorPendingQuestion(null);
            setLootDrop({ type: "exp", amount: 0, rarity: "common", message: `${assistantLabel} 提问需要 10 星光币` });
            return;
        }

        setIsAskingTutor(true);
        setTutorPendingQuestion(question);
        setTutorQuery("");
        setTutorAnswer("");

        const teachingPoint = activeTutorTeachingPoint;
        const requestedType = options?.questionType ?? "follow_up";
        const unlockRequested = requestedType === "unlock_answer" || options?.forceReveal === true;
        const shouldReveal = unlockRequested;
        const outgoingQuestionType: TutorQuestionType = shouldReveal ? "unlock_answer" : requestedType;
        const outgoingIntent = inferTutorIntent(outgoingQuestionType, teachingPoint);
        const outgoingFocusSpan = (
            rebuildTutorSession?.focusSpan
            || getCurrentSelectionFocusSpan()
            || inferFocusSpan(question)
        ).slice(0, 80);
        const outgoingSurface: TutorUiSurface = isRebuildFloatingTutorSurface
            ? "rebuild_floating_teacher"
            : (isRebuildTutorSurface || isScoreTutorPopupSurface)
                ? "score"
                : "battle";
        const userAttemptText = (
            isRebuildTutorSurface
                ? (rebuildFeedback?.evaluation.userSentence || rebuildAnswerTokens.map((token) => token.text).join(" "))
                : userTranslation
        ) || "";
        const improvedVersionText = isRebuildTutorSurface
            ? drillData.reference_english
            : drillFeedback?.improved_version;
        const scoreValue = isRebuildTutorSurface
            ? (rebuildFeedback ? Math.round((rebuildFeedback.evaluation.accuracyRatio ?? 0) * 100) : undefined)
            : drillFeedback?.score;
        const shouldCompactRebuildContext = isRebuildFloatingTutorSurface && Boolean(rebuildTutorSession?.hasBootstrappedContext);
        const drillContextPayload = shouldCompactRebuildContext
            ? {
                chinese: drillData.chinese,
                reference_english: drillData.reference_english,
            }
            : drillData;

        let hasVocabInception = false;
        const ragInjectedMastery = [...tutorRecentMastery];

        try {
            const queryTarget = userAttemptText || question;
            if (queryTarget.length > 3) {
                const ragMemories = await requestRagQuery(queryTarget, 4, 0.80);

                const topVocab = ragMemories.find((memory) => memory.source === "vocab" && memory.score > 0.80);
                if (topVocab) {
                    hasVocabInception = true;
                    ragInjectedMastery.push(`[✨RAG生词渗透] 强制要求在你的回复中，必须利用该学生最近收藏的生词 '${topVocab.metadata?.vocabId || topVocab.text}' 来造一个与之相关的例句！`);
                }
            }
        } catch (error) {
            console.warn("RAG query failed inline", error);
        }

        try {
            if (shouldChargeTutorCoins) {
                applyEconomyPatch({ coinsDelta: -10 });
                setLootDrop({ type: "exp", amount: 0, rarity: "common", message: `${assistantLabel} 提问 -10 星光币` });
            }

            const response = await fetch("/api/ai/ask_tutor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "ask",
                    answerMode: tutorAnswerMode,
                    articleTitle: drillData._topicMeta?.topic || context.articleTitle || context.topic,
                    drillContext: drillContextPayload,
                    focusSpan: outgoingFocusSpan,
                    improvedVersion: shouldCompactRebuildContext ? "" : improvedVersionText,
                    intent: outgoingIntent,
                    persona: effectivePersona,
                    query: question,
                    questionType: outgoingQuestionType,
                    recentMastery: ragInjectedMastery,
                    recentTurns: tutorThread.slice(shouldCompactRebuildContext ? -4 : -6).map((item) => ({
                        answer: item.coach_markdown,
                        question: item.question,
                    })),
                    revealAnswer: shouldReveal,
                    score: shouldCompactRebuildContext ? undefined : scoreValue,
                    sessionBootstrapped: shouldCompactRebuildContext,
                    stream: true,
                    teachingPoint,
                    thinkingMode: tutorThinkingMode,
                    uiSurface: outgoingSurface,
                    userAttempt: shouldCompactRebuildContext ? "" : userAttemptText,
                }),
            });

            if (!response.ok) {
                throw new Error("Tutor 请求失败");
            }

            let normalized: TutorStructuredResponse | null = null;
            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("text/event-stream") && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let streamedCoach = "";

                const applyStreamingCoach = (coach: string) => {
                    setTutorAnswer(coach);
                    setTutorResponse((previous) => ({
                        answer_reason_cn: previous?.answer_reason_cn,
                        answer_revealed: previous?.answer_revealed ?? false,
                        coach_markdown: coach,
                        error_tags: previous?.error_tags ?? [],
                        example_sentences: previous?.example_sentences,
                        full_answer: previous?.full_answer,
                        quality_flags: previous?.quality_flags ?? [],
                        response_intent: previous?.response_intent,
                        teaching_point: previous?.teaching_point ?? teachingPoint,
                    }));
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let boundaryIndex = buffer.indexOf("\n\n");
                    while (boundaryIndex !== -1) {
                        const message = buffer.slice(0, boundaryIndex);
                        buffer = buffer.slice(boundaryIndex + 2);
                        boundaryIndex = buffer.indexOf("\n\n");

                        let eventName = "message";
                        let dataLine = "";
                        for (const line of message.split("\n")) {
                            if (line.startsWith("event:")) {
                                eventName = line.slice(6).trim();
                            } else if (line.startsWith("data:")) {
                                dataLine += line.slice(5).trim();
                            }
                        }

                        if (!dataLine || dataLine === "[DONE]") continue;

                        if (eventName === "error") {
                            if (streamedCoach) {
                                normalized = normalizeTutorResponse(
                                    { answer_revealed: shouldReveal, coach_markdown: streamedCoach, teaching_point: teachingPoint },
                                    teachingPoint
                                );
                                continue;
                            }
                            setTutorAnswer(`${assistantLabel} 刚才的流式讲解中断了。你可以直接再问一次，或者换个更具体的卡点来问。`);
                            setTutorPendingQuestion(null);
                            continue;
                        }

                        if (eventName === "chunk") {
                            try {
                                const parsedChunk = JSON.parse(dataLine) as { coach_markdown?: string };
                                if (typeof parsedChunk.coach_markdown === "string" && parsedChunk.coach_markdown.trim()) {
                                    streamedCoach = parsedChunk.coach_markdown.trim();
                                    applyStreamingCoach(streamedCoach);
                                }
                            } catch {
                                continue;
                            }
                        }

                        if (eventName === "final") {
                            try {
                                const parsedFinal = JSON.parse(dataLine);
                                normalized = normalizeTutorResponse(parsedFinal, teachingPoint);
                            } catch {
                                continue;
                            }
                        }
                    }
                }

                if (!normalized && streamedCoach) {
                    normalized = normalizeTutorResponse(
                        { answer_revealed: shouldReveal, coach_markdown: streamedCoach, teaching_point: teachingPoint },
                        teachingPoint
                    );
                }
            } else {
                const data = await response.json();
                if (data?.error) {
                    throw new Error(data.error);
                }
                normalized = normalizeTutorResponse(data, teachingPoint);
            }

            if (!normalized) {
                throw new Error("暂时没有拿到回复，请再问一次。");
            }

            setTutorResponse(normalized);
            setTutorAnswer(normalized.coach_markdown);
            rememberTutorMastery(normalized, outgoingFocusSpan);
            if (isRebuildFloatingTutorSurface) {
                setRebuildTutorSession((current) => current ? ({
                    ...current,
                    focusSpan: outgoingFocusSpan || current.focusSpan,
                    hasBootstrappedContext: true,
                    isOpen: true,
                    teachingPoint: normalized.teaching_point || current.teachingPoint,
                }) : current);
            }
            setTutorThread((previous) => [
                ...previous,
                {
                    ...normalized,
                    question,
                    question_type: outgoingQuestionType,
                    vocab_inception: hasVocabInception,
                },
            ].slice(-8));
            setTutorPendingQuestion(null);
        } catch (error) {
            console.error(error);
            setTutorAnswer(`${assistantLabel} 暂时不可用，请稍后重试。`);
            setTutorPendingQuestion(null);
            if (shouldChargeTutorCoins) {
                applyEconomyPatch({ coinsDelta: 10 });
                setLootDrop({ type: "exp", amount: 0, rarity: "common", message: `${assistantLabel} 提问失败，已退还 10 星光币` });
            }
        } finally {
            setIsAskingTutor(false);
        }
    }, [
        activeTutorTeachingPoint,
        applyEconomyPatch,
        coinsRef,
        context.articleTitle,
        context.topic,
        drillData,
        drillFeedback,
        effectivePersona,
        getCurrentSelectionFocusSpan,
        inferFocusSpan,
        inferTutorIntent,
        isRebuildFloatingTutorSurface,
        isRebuildTutorSurface,
        isScoreTutorPopupSurface,
        normalizeTutorResponse,
        rebuildAnswerTokens,
        rebuildFeedback,
        rebuildTutorSession,
        rememberTutorMastery,
        setIsAskingTutor,
        setLootDrop,
        setRebuildTutorSession,
        setTutorAnswer,
        setTutorPendingQuestion,
        setTutorQuery,
        setTutorResponse,
        setTutorThread,
        tutorAnswerMode,
        tutorQuery,
        tutorRecentMastery,
        tutorThinkingMode,
        tutorThread,
        userTranslation,
    ]);

    return {
        handleAskTutor,
    };
}
