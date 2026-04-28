"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export interface RebuildFeedbackStageProps {
    backgroundClassName: string;
    containerClassName?: string;
    continueLabel: string;
    isOpen: boolean;
    modalKey: string;
    onContinue: () => void;
    prefersReducedMotion: boolean;
    promptNode: ReactNode;
    shadowingNode: ReactNode;
    showPrompt: boolean;
}

export function RebuildFeedbackStage({
    backgroundClassName,
    containerClassName = "mx-auto w-full max-w-4xl pt-8 md:pt-10",
    continueLabel,
    isOpen,
    modalKey,
    onContinue,
    prefersReducedMotion,
    promptNode,
    shadowingNode,
    showPrompt,
}: RebuildFeedbackStageProps) {
    return (
        <AnimatePresence>
            {isOpen ? (
                <motion.div
                    key={modalKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 z-[60] overflow-y-auto custom-scrollbar p-4 md:p-6 pb-48 ${backgroundClassName}`}
                >
                    <motion.div
                        initial={prefersReducedMotion ? false : { opacity: 0, y: showPrompt ? 22 : 34, scale: showPrompt ? 0.98 : 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: showPrompt ? 16 : 22, scale: showPrompt ? 0.98 : 0.97 }}
                        transition={prefersReducedMotion ? { duration: 0.14 } : showPrompt ? { duration: 0.32, ease: "easeOut" } : { type: "spring" as const, stiffness: 260, damping: 24, mass: 0.85 }}
                        className={containerClassName}
                    >
                        {showPrompt ? (
                            promptNode
                        ) : (
                            <div className="mx-auto w-full max-w-3xl space-y-4">
                                {shadowingNode}
                                <div className="flex justify-center">
                                    <button
                                        type="button"
                                        onClick={onContinue}
                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:bg-stone-50"
                                    >
                                        {continueLabel}
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
