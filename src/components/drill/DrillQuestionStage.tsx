"use client";

import type { ComponentProps, ReactNode } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

import { DictationInputStage } from "./DictationInputStage";
import { ListeningPromptStage } from "./ListeningPromptStage";
import { ShadowingInputStage } from "./ShadowingInputStage";
import { TranslationInputPanel } from "./TranslationInputPanel";
import { TranslationPromptStage } from "./TranslationPromptStage";

export interface DrillQuestionStageProps {
    bodyClassName: string;
    blurActive: boolean;
    contentClassName: string;
    interactiveAreaClassName: string;
    isAudioPracticeMode: boolean;
    isGeneratingDrill: boolean;
    isRebuildMode: boolean;
    listeningPromptProps?: ComponentProps<typeof ListeningPromptStage> | null;
    onRefresh: () => void;
    rebuildQuestionNode: ReactNode;
    shadowingInputProps?: ComponentProps<typeof ShadowingInputStage> | null;
    showDivider: boolean;
    sourceAreaClassName: string;
    sourceMotionClassName: string;
    translationInputProps?: ComponentProps<typeof TranslationInputPanel> | null;
    translationPromptProps?: ComponentProps<typeof TranslationPromptStage> | null;
    dictationInputProps?: ComponentProps<typeof DictationInputStage> | null;
}

export function DrillQuestionStage({
    bodyClassName,
    blurActive,
    contentClassName,
    interactiveAreaClassName,
    isAudioPracticeMode,
    isGeneratingDrill,
    isRebuildMode,
    listeningPromptProps,
    onRefresh,
    rebuildQuestionNode,
    shadowingInputProps,
    showDivider,
    sourceAreaClassName,
    sourceMotionClassName,
    translationInputProps,
    translationPromptProps,
    dictationInputProps,
}: DrillQuestionStageProps) {
    return (
        <motion.div
            key="question"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={cn(
                "absolute inset-0 overflow-y-auto custom-scrollbar flex flex-col transition-[filter,opacity,transform] duration-300",
                bodyClassName,
                blurActive && "pointer-events-none opacity-15 blur-[3px]"
            )}
        >
            <div className={contentClassName}>
                <div className={sourceAreaClassName}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={sourceMotionClassName}>
                        {isAudioPracticeMode ? <ListeningPromptStage {...listeningPromptProps!} /> : <TranslationPromptStage {...translationPromptProps!} />}

                        <div className="flex justify-center mt-4 opacity-0 pointer-events-none h-0 overflow-hidden">
                            <button onClick={onRefresh} disabled={isGeneratingDrill} className="flex items-center gap-2 px-4 py-2 text-sm text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50 rounded-full transition-all disabled:opacity-50">
                                <RefreshCw className={cn("w-4 h-4", isGeneratingDrill && "animate-spin")} /> 换一题
                            </button>
                        </div>
                    </motion.div>
                </div>

                {showDivider ? (
                    <div className="my-3 h-px w-full max-w-xs mx-auto bg-gradient-to-r from-transparent via-stone-200 to-transparent md:my-4" />
                ) : null}

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={interactiveAreaClassName}
                >
                    <div className="relative group">
                        {isRebuildMode
                            ? rebuildQuestionNode
                            : shadowingInputProps
                                ? <ShadowingInputStage {...shadowingInputProps} />
                                : dictationInputProps
                                    ? <DictationInputStage {...dictationInputProps} />
                                    : translationInputProps
                                        ? <TranslationInputPanel {...translationInputProps} />
                                        : null}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
