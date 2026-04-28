"use client";

import type { ComponentProps } from "react";
import { AnimatePresence } from "framer-motion";

import { WordPopup } from "../reading/WordPopup";
import { TranslationSlotMachine } from "@/components/battle/TranslationSlotMachine";
import { DrillTutorOverlays } from "./DrillTutorOverlays";

export interface DrillOverlayLayerProps {
    slotMachineKey?: string;
    slotMachineProps?: ComponentProps<typeof TranslationSlotMachine> | null;
    tutorOverlaysProps: ComponentProps<typeof DrillTutorOverlays>;
    wordPopupProps?: ComponentProps<typeof WordPopup> | null;
}

export function DrillOverlayLayer({
    slotMachineKey,
    slotMachineProps,
    tutorOverlaysProps,
    wordPopupProps,
}: DrillOverlayLayerProps) {
    return (
        <>
            <AnimatePresence>
                {slotMachineProps ? <TranslationSlotMachine key={slotMachineKey} {...slotMachineProps} /> : null}
            </AnimatePresence>

            {wordPopupProps ? <WordPopup key="word-popup" {...wordPopupProps} /> : null}

            <DrillTutorOverlays {...tutorOverlaysProps} />
        </>
    );
}
