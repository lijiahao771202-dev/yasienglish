"use client";

import type { ComponentProps } from "react";

import { SpotlightTour } from "@/components/ui/SpotlightTour";

import { GhostSettingsModal } from "../vocab/GhostSettingsModal";
import { DrillShopModal } from "./DrillShopModal";

export interface DrillSupportOverlaysProps {
    ghostSettingsModalProps: ComponentProps<typeof GhostSettingsModal>;
    shopModalProps: ComponentProps<typeof DrillShopModal>;
    spotlightTourProps: ComponentProps<typeof SpotlightTour>;
}

export function DrillSupportOverlays({
    ghostSettingsModalProps,
    shopModalProps,
    spotlightTourProps,
}: DrillSupportOverlaysProps) {
    return (
        <>
            <DrillShopModal {...shopModalProps} />
            <SpotlightTour {...spotlightTourProps} />
            <GhostSettingsModal {...ghostSettingsModalProps} />
        </>
    );
}
