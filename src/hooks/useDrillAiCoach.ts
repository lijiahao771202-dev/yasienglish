"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { buildCoachDrawerUserMessage, resolveCoachCurrentInput } from "@/lib/coach-input";

type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";

export interface AiCoachHistoryMessage {
    role: string;
    content: string;
}

interface DrillAiCoachDrillData {
    id?: string;
    chinese?: string;
    reference_english?: string;
}

interface UseDrillAiCoachParams {
    mode: DrillMode;
    drillData?: DrillAiCoachDrillData | null;
    hasDrillFeedback: boolean;
    userTranslation: string;
    setUserTranslation: Dispatch<SetStateAction<string>>;
}

function buildDrawerSystemPrompt(params: {
    chinese: string;
    referenceEnglish: string;
}) {
    return `你是一个贴心、专业且精准的英语阅读与写作智能答疑助手。
【本题原文】：${params.chinese}
【官方参考】：${params.referenceEnglish}

你不要包含任何 JSON，请直接使用自然语言对话。
学生正在使用【自由提问】功能，请你为他们答疑解惑，指出他们当前的语法错误或给出更好的表述建议。短平快地切中要害，绝不废话！`;
}

export function useDrillAiCoach({
    drillData,
    userTranslation,
}: UseDrillAiCoachParams) {
    const [isCoachHistoryOpen, setIsCoachHistoryOpen] = useState(false);
    const [drawerInputValue, setDrawerInputValue] = useState("");
    const [isDrawerChatPending, setIsDrawerChatPending] = useState(false);
    const [drawerStreamingText, setDrawerStreamingText] = useState("");
    const [history, setHistory] = useState<AiCoachHistoryMessage[]>([]);

    const historyRef = useRef<AiCoachHistoryMessage[]>([]);
    const historyAnchorRef = useRef("");

    const replaceHistory = useCallback((nextHistory: AiCoachHistoryMessage[]) => {
        historyRef.current = nextHistory;
        setHistory(nextHistory);
    }, []);

    const submitDrawerChat = useCallback(async (message: string) => {
        if (!message.trim() || isDrawerChatPending || !drillData?.chinese || !drillData?.reference_english) return;

        setIsDrawerChatPending(true);
        const currentInput = resolveCoachCurrentInput({
            fallbackInput: userTranslation,
        });
        const userMessage = buildCoachDrawerUserMessage({
            question: message,
            currentInput,
        });
        const nextHistory = [...historyRef.current, { role: "user", content: userMessage }];
        replaceHistory(nextHistory);

        try {
            const response = await fetch("/api/ai/coach_stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemPrompt: buildDrawerSystemPrompt({
                        chinese: drillData.chinese,
                        referenceEnglish: drillData.reference_english,
                    }),
                    history: nextHistory.slice(0, -1),
                    userMessage,
                }),
            });

            if (!response.ok || !response.body) throw new Error("Chat API error");

            setDrawerInputValue("");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let accumulatedText = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulatedText += decoder.decode(value, { stream: true });
                setDrawerStreamingText(accumulatedText);
            }

            replaceHistory([...nextHistory, { role: "assistant", content: accumulatedText }]);
            historyAnchorRef.current = currentInput;
            setDrawerStreamingText("");
        } catch {
            replaceHistory(nextHistory.slice(0, -1));
        } finally {
            setIsDrawerChatPending(false);
        }
    }, [drillData?.chinese, drillData?.reference_english, isDrawerChatPending, replaceHistory, userTranslation]);

    return {
        isCoachHistoryOpen,
        setIsCoachHistoryOpen,
        drawerInputValue,
        setDrawerInputValue,
        isDrawerChatPending,
        drawerStreamingText,
        submitDrawerChat,
        history,
    };
}
