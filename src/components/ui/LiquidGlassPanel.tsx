"use client";

import type { HTMLAttributes, MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface LiquidGlassPanelProps extends HTMLAttributes<HTMLDivElement> {
    breathe?: boolean;
}

export function LiquidGlassPanel({ breathe = false, className, children, onMouseMove, ...props }: LiquidGlassPanelProps) {
    const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = `${event.clientX - rect.left}px`;
        const y = `${event.clientY - rect.top}px`;
        event.currentTarget.style.setProperty("--lg-mouse-x", x);
        event.currentTarget.style.setProperty("--lg-mouse-y", y);
        onMouseMove?.(event);
    };

    return (
        <div
            {...props}
            onMouseMove={handleMouseMove}
            className={cn(
                "liquid-glass-panel",
                breathe && "liquid-glass-breathe",
                className,
            )}
        >
            <div className="liquid-glass-caustic" />
            <div className="liquid-glass-rim" />
            <div className="liquid-glass-sheen" />
            <div className="liquid-glass-inner-glow" />
            <div className="liquid-glass-noise" />
            <div className="liquid-glass-content">{children}</div>
        </div>
    );
}
