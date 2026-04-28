"use client";

import type { ComponentProps } from "react";

import { RebuildFeedbackStage } from "./RebuildFeedbackStage";

export interface DrillRebuildFeedbackOverlaysProps {
    passageStageProps?: ComponentProps<typeof RebuildFeedbackStage> | null;
    sentenceStageProps?: ComponentProps<typeof RebuildFeedbackStage> | null;
}

export function DrillRebuildFeedbackOverlays({
    passageStageProps,
    sentenceStageProps,
}: DrillRebuildFeedbackOverlaysProps) {
    return (
        <>
            {sentenceStageProps ? <RebuildFeedbackStage {...sentenceStageProps} /> : null}
            {passageStageProps ? <RebuildFeedbackStage {...passageStageProps} /> : null}
        </>
    );
}
