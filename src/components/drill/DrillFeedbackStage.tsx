"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BossScoreReveal } from "./BossScoreReveal";

export interface DrillFeedbackStageProps {
    bossRevealType: "reaper" | "lightning" | "gamble" | "other";
    feedbackNode: ReactNode;
    onBossNext: () => void;
    onBossRetry?: () => void;
    score: number;
    showBossReveal: boolean;
}

export function DrillFeedbackStage({
    bossRevealType,
    feedbackNode,
    onBossNext,
    onBossRetry,
    score,
    showBossReveal,
}: DrillFeedbackStageProps) {
    return (
        <AnimatePresence mode="wait">
            {showBossReveal ? (
                <BossScoreReveal
                    key="boss-feedback"
                    score={score}
                    drift={0}
                    type={bossRevealType}
                    onNext={onBossNext}
                    onRetry={onBossRetry}
                />
            ) : (
                <motion.div
                    key="feedback"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-48"
                >
                    {feedbackNode}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
