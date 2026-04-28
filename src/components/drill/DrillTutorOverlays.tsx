"use client";

import type { RefObject } from "react";

import { AiCoachHistoryDrawer, type AiCoachHistoryMessage } from "./AiCoachHistoryDrawer";
import { RebuildTutorLauncher, RebuildTutorPopup, type RebuildTutorPopupState } from "./RebuildTutorPopup";
import type { TutorHistoryTurn } from "./AiTeacherConversation";

interface DrillTutorPopupConfig {
    answerMode: "adaptive" | "simple" | "detailed";
    inputClass: string;
    isAsking: boolean;
    mutedTextClass?: string;
    panelClass: string;
    query: string;
    sendButtonClass: string;
    thinkingMode: "chat" | "deep";
    turns: TutorHistoryTurn[];
}

interface DrillTutorPopupCallbacks {
    onAnswerModeChange: (value: "adaptive" | "simple" | "detailed") => void;
    onClose: () => void;
    onPlayCardAudio: (text: string) => void;
    onQueryChange: (value: string) => void;
    onSubmit: () => void;
    onThinkingModeChange: (value: "chat" | "deep") => void;
}

export interface DrillTutorOverlaysProps {
    coachDrawer: {
        history: AiCoachHistoryMessage[];
        inputValue: string;
        isOpen: boolean;
        isPending: boolean;
        onClose: () => void;
        onInputChange: (value: string) => void;
        onSubmit: (message: string) => void | Promise<void>;
        streamingText: string;
    };
    conversationRef: RefObject<HTMLDivElement | null>;
    popupConfig: DrillTutorPopupConfig;
    popupState: {
        fallbackAnswer?: string | null;
        pendingAnswer?: string | null;
        pendingQuestion?: string | null;
        rebuildSession?: RebuildTutorPopupState | null;
        scoreSession?: RebuildTutorPopupState | null;
        showLauncher: boolean;
    };
    popupCallbacks: {
        launcherOpen: (anchorPoint: { x: number; y: number }) => void;
        rebuild: DrillTutorPopupCallbacks;
        score: DrillTutorPopupCallbacks;
    };
}

export function DrillTutorOverlays({
    coachDrawer,
    conversationRef,
    popupConfig,
    popupState,
    popupCallbacks,
}: DrillTutorOverlaysProps) {
    const sharedPopupProps = {
        query: popupConfig.query,
        turns: popupConfig.turns,
        pendingQuestion: popupState.pendingQuestion,
        pendingAnswer: popupState.pendingQuestion ? popupState.pendingAnswer ?? null : null,
        fallbackAnswer: !popupConfig.turns.length ? popupState.fallbackAnswer ?? null : null,
        isAsking: popupConfig.isAsking,
        thinkingMode: popupConfig.thinkingMode,
        answerMode: popupConfig.answerMode,
        mutedTextClass: popupConfig.mutedTextClass,
        panelClass: popupConfig.panelClass,
        inputClass: popupConfig.inputClass,
        sendButtonClass: popupConfig.sendButtonClass,
        conversationRef,
    };

    return (
        <>
            <AiCoachHistoryDrawer
                isOpen={coachDrawer.isOpen}
                history={coachDrawer.history}
                inputValue={coachDrawer.inputValue}
                isPending={coachDrawer.isPending}
                streamingText={coachDrawer.streamingText}
                onClose={coachDrawer.onClose}
                onInputChange={coachDrawer.onInputChange}
                onSubmit={coachDrawer.onSubmit}
            />

            {popupState.showLauncher ? (
                <RebuildTutorLauncher onOpen={popupCallbacks.launcherOpen} />
            ) : null}

            {popupState.rebuildSession?.isOpen ? (
                <RebuildTutorPopup
                    popup={popupState.rebuildSession}
                    {...sharedPopupProps}
                    onClose={popupCallbacks.rebuild.onClose}
                    onPlayCardAudio={popupCallbacks.rebuild.onPlayCardAudio}
                    onQueryChange={popupCallbacks.rebuild.onQueryChange}
                    onThinkingModeChange={popupCallbacks.rebuild.onThinkingModeChange}
                    onAnswerModeChange={popupCallbacks.rebuild.onAnswerModeChange}
                    onSubmit={popupCallbacks.rebuild.onSubmit}
                />
            ) : null}

            {popupState.scoreSession?.isOpen ? (
                <RebuildTutorPopup
                    popup={popupState.scoreSession}
                    {...sharedPopupProps}
                    onClose={popupCallbacks.score.onClose}
                    onPlayCardAudio={popupCallbacks.score.onPlayCardAudio}
                    onQueryChange={popupCallbacks.score.onQueryChange}
                    onThinkingModeChange={popupCallbacks.score.onThinkingModeChange}
                    onAnswerModeChange={popupCallbacks.score.onAnswerModeChange}
                    onSubmit={popupCallbacks.score.onSubmit}
                />
            ) : null}
        </>
    );
}
