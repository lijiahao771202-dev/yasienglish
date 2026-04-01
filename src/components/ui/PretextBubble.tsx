"use client";

import { forwardRef, type HTMLAttributes, useRef } from "react";

import { usePretextMeasuredLayout } from "@/hooks/usePretextMeasuredLayout";
import { cn } from "@/lib/utils";
import type { PretextWhiteSpaceMode } from "@/lib/text-layout/pretext";

interface PretextBubbleProps extends HTMLAttributes<HTMLDivElement> {
    text: string;
    maxWidthRatio?: number;
    minWidthPx?: number;
    whiteSpaceMode?: PretextWhiteSpaceMode;
    pretextEnabled?: boolean;
}

export const PretextBubble = forwardRef<HTMLDivElement, PretextBubbleProps>(function PretextBubble(
    {
        text,
        maxWidthRatio = 0.85,
        minWidthPx = 84,
        whiteSpaceMode = "pre-wrap",
        pretextEnabled = true,
        className,
        children,
        ...props
    },
    forwardedRef,
) {
    const localRef = useRef<HTMLDivElement | null>(null);

    usePretextMeasuredLayout(localRef, {
        text,
        mode: "bubble",
        enabled: pretextEnabled,
        maxWidthRatio,
        minBubbleWidthPx: minWidthPx,
        whiteSpaceMode,
    });

    return (
        <div
            {...props}
            ref={(node) => {
                localRef.current = node;
                if (typeof forwardedRef === "function") {
                    forwardedRef(node);
                } else if (forwardedRef) {
                    forwardedRef.current = node;
                }
            }}
            className={cn(className)}
        >
            {children}
        </div>
    );
});
