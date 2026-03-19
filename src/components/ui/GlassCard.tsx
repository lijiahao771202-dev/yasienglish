"use client";

import type { HTMLAttributes } from "react";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
    breathe?: boolean;
    hoverEffect?: boolean;
}

export function GlassCard({
    breathe = false,
    hoverEffect = false,
    className,
    children,
    ...props
}: GlassCardProps) {
    return (
        <LiquidGlassPanel
            {...props}
            breathe={breathe}
            className={cn(hoverEffect && "liquid-glass-hover liquid-glass-tap", className)}
        >
            {children}
        </LiquidGlassPanel>
    );
}
