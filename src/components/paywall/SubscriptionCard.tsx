"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SubscriptionCardProps {
    id: string;
    title: string;
    price: string;
    period: string; // e.g., "per year" or "/ month"
    description?: string;
    isPopular?: boolean;
    popularLabel?: string;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

export function SubscriptionCard({
    id,
    title,
    price,
    period,
    description,
    isPopular,
    popularLabel,
    isSelected,
    onSelect,
}: SubscriptionCardProps) {
    return (
        <motion.button
            type="button"
            onClick={() => onSelect(id)}
            className="group relative flex w-full flex-col items-start justify-between rounded-3xl p-[2px] transition-all duration-500 ease-out sm:flex-row sm:items-center focus:outline-none"
            whileTap={{ scale: 0.98 }}
        >
            {/* Animated Gradient Border Layer */}
            {isSelected && (
                <motion.div
                    layoutId="paywall-active-ring"
                    className="absolute inset-0 z-0 rounded-3xl bg-gradient-to-br from-indigo-300 via-white/80 to-purple-300 shadow-[0_0_24px_rgba(255,255,255,0.4)]"
                    transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
                />
            )}

            {/* Inactive Subtle Border Base */}
            {!isSelected && (
                <div className="absolute inset-0 z-0 rounded-3xl border border-white/20 bg-white/5 transition-all duration-300 group-hover:bg-white/10" />
            )}

            {/* Inner Content Card (Glassmorphism) */}
            <div
                className={cn(
                    "relative z-10 flex w-full flex-col sm:flex-row justify-between items-center px-6 py-5 rounded-[calc(1.5rem-2px)] backdrop-blur-md transition-all duration-500",
                    isSelected ? "bg-white/15" : "bg-transparent"
                )}
            >
                {isPopular && (
                    <div className="absolute -top-3 left-6 inline-flex animate-pulse items-center justify-center rounded-full bg-gradient-to-r from-amber-200 to-amber-100 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-900 shadow-sm">
                        {popularLabel || "Best Value"}
                    </div>
                )}

                <div className="flex flex-col items-start text-left mt-2 sm:mt-0">
                    <h3 className={cn(
                        "font-newsreader text-xl font-semibold transition-colors duration-300",
                        isSelected ? "text-white drop-shadow-sm" : "text-white/80"
                    )}>
                        {title}
                    </h3>
                    {description && (
                        <p className="mt-1 text-xs font-medium text-white/60">
                            {description}
                        </p>
                    )}
                </div>

                <div className="flex flex-col items-start sm:items-end mt-4 sm:mt-0 text-left sm:text-right">
                    <div className="flex items-end gap-1">
                        <span className={cn(
                            "font-sans text-2xl font-bold tracking-tight transition-colors duration-300",
                            isSelected ? "text-white" : "text-white/90"
                        )}>
                            {price}
                        </span>
                        <span className="mb-1 pb-[1px] text-xs font-medium text-white/50">{period}</span>
                    </div>
                </div>

                {/* Selection Indicator Circle */}
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/30 transition-all duration-300 hidden sm:flex">
                    <div
                        className={cn(
                            "h-2.5 w-2.5 rounded-full transition-all duration-300",
                            isSelected ? "bg-white scale-100" : "bg-transparent scale-50 opacity-0"
                        )}
                    />
                </div>
            </div>
            
            {/* Mobile Selection Indicator (Absolute Top Right) */}
            <div className="absolute right-5 top-5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/30 transition-all duration-300 sm:hidden z-10">
                <div
                    className={cn(
                        "h-2.5 w-2.5 rounded-full transition-all duration-300",
                        isSelected ? "bg-white scale-100" : "bg-transparent scale-50 opacity-0"
                    )}
                />
            </div>
        </motion.button>
    );
}
