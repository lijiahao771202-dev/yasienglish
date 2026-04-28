"use client";

import { forwardRef, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { DrillShellEffects } from "./DrillShellEffects";

export interface DrillReadySurfaceProps {
    bodyNode: ReactNode;
    className: string;
    headerNode: ReactNode;
    isReady: boolean;
    isRebuildPassage: boolean;
    overlayNode: ReactNode;
    shellEffectsProps: ComponentProps<typeof DrillShellEffects>;
    style?: CSSProperties;
}

export const DrillReadySurface = forwardRef<HTMLDivElement, DrillReadySurfaceProps>(function DrillReadySurface({
    bodyNode,
    className,
    headerNode,
    isReady,
    isRebuildPassage,
    overlayNode,
    shellEffectsProps,
    style,
}, ref) {
    return (
        <AnimatePresence mode="popLayout">
            {isReady ? (
                <motion.div
                    key="drill-shell-card"
                    initial={{ scale: 0.92, opacity: 0, y: 30, filter: "blur(12px)" }}
                    animate={{ scale: 1, opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ scale: 0.95, opacity: 0, y: -15, filter: "blur(8px)" }}
                    transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] as const }}
                    layout
                    ref={ref}
                    className={className}
                    style={style}
                >
                    <DrillShellEffects {...shellEffectsProps} />

                    <div
                        className={cn(
                            "flex items-center p-3 md:p-4 shrink-0",
                            isRebuildPassage
                                ? "justify-between"
                                : "justify-between border-b border-stone-100/50"
                        )}
                    >
                        {headerNode}
                    </div>

                    <div className="flex-1 relative overflow-y-auto flex flex-col overflow-x-hidden">
                        {bodyNode}
                    </div>

                    {overlayNode}
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
});
